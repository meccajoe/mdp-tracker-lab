"""Read-only extraction of the approved Fonroche attachment (requires openpyxl).

Usage: python scripts/lab/extract-v27-fixture.py /path/to/Fonroche.xlsx
Writes a versioned fixture; never contacts the workbook's linked Google Sheet.
"""
import hashlib
import json
import pathlib
import sys
import openpyxl

source = pathlib.Path(sys.argv[1])
raw = openpyxl.load_workbook(source, data_only=False)
cached = openpyxl.load_workbook(source, data_only=True)
digest = hashlib.sha256(source.read_bytes()).hexdigest()
settings_rows = {
    'contingency': 4, 'opex': 5, 'indirect': 6, 'laborSell': 8,
    'materialMarkup': 11, 'shopDay': 12, 'efficiency': 13,
    'graphicsSell': 16, 'graphicsCost': 17, 'handlingMinutes': 18,
    'handlingCrew': 19, 'designSell': 22, 'pmFee': 23, 'pmBonus': 25,
    'leadDay': 27, 'supportDay': 28, 'travelFactor': 29, 'pmTravelDay': 30,
    'siteHours': 31, 'supportCost': 32, 'offFactor': 33,
    'equipmentMarkup': 36, 'resaleMarkup': 37, 'travelMarkup': 38,
    'freightMarkup': 39, 'burdenMultiplier': 64,
}
settings = {key: cached['Settings'][f'B{row}'].value for key, row in settings_rows.items()}
settings['burdenedRateOverride'] = None if raw['Settings']['B7'].data_type == 'f' else cached['Settings']['B7'].value
trades = [{'id': f'trade-{r}', 'name': cached['Settings'][f'A{r}'].value,
           'wage': cached['Settings'][f'B{r}'].value}
          for r in range(66, 78) if cached['Settings'][f'A{r}'].value]
trade_by_name = {x['name']: x['id'] for x in trades}
catalog = []
for r in list(range(5, 1005)) + list(range(1009, 1059)):
    name, unit, cost = [cached['Materials DB'].cell(r, c).value for c in (1, 2, 3)]
    if not name:
        continue
    if cost is not None and not isinstance(cost, (float, int)):
        raise ValueError(f'Unresolved catalog cost at row {r}: {cost}')
    catalog.append({'id': f'material-{r}', 'name': name, 'unit': unit or '',
                    'unitCost': cost or 0, 'source': f'Materials DB!A{r}:C{r}'})
# Excel VLOOKUP uses the first exact match. The runtime uses IDs only.
catalog_by_name = {}
for material in catalog:
    catalog_by_name.setdefault(material['name'], material['id'])
fields = dict(materials='C', resale='D', hours='E', days='F', sqft='G',
              panels='H', rental='I', siteDays='J', travelDays='K', cost='M')
lines, expectations, input_sources = [], [], {}
for r in range(5, 43):
    sheet = cached['Quote Builder']
    name, kind = sheet[f'A{r}'].value, sheet[f'B{r}'].value
    if not name or not kind:
        continue
    line_id = f'line-{r}'
    inputs, overrides = {}, {}
    for key, column in fields.items():
        cell = raw['Quote Builder'][f'{column}{r}']
        inputs[key] = sheet[cell.coordinate].value or 0
        input_sources[f'{line_id}.{key}'] = {'cell': f'Quote Builder!{cell.coordinate}', 'formula': cell.value if cell.data_type == 'f' else None}
        if key in ('materials', 'resale', 'hours'):
            inputs[key] = 0
            if cell.data_type != 'f' and cell.value is not None:
                overrides[key] = cell.value
    override = sheet[f'O{r}'].value
    if kind == 'Project Management Fee' and raw['Quote Builder'][f'N{r}'].data_type != 'f':
        override = override if override is not None else sheet[f'N{r}'].value
    lines.append({'id': line_id, 'name': name, 'type': kind, 'takeoffDriven': True,
                  'inputs': inputs, 'overrides': overrides, 'priceOverride': override,
                  'source': f'Quote Builder!A{r}:X{r}'})
    expectations.append({'id': line_id, **{key: sheet[f'{column}{r}'].value or 0 for key, column in {
        'finalPrice': 'P', 'materialsBudget': 'Q', 'hoursAllowed': 'R',
        'laborBudget': 'S', 'buildBudget': 'T', 'contingency': 'U', 'indirect': 'V', 'margin': 'W'}.items()}})
line_by_name = {x['name']: x['id'] for x in lines}
takeoffs = []
for r in range(5, 501):
    sheet = cached['Takeoffs']
    name, description = sheet[f'A{r}'].value, sheet[f'B{r}'].value
    if not name or not description:
        continue
    if name not in line_by_name:
        raise ValueError(f'Takeoff row {r} has no matching quote line')
    cost_cell = raw['Takeoffs'][f'E{r}']
    takeoffs.append({'id': f'takeoff-{r}', 'lineId': line_by_name[name], 'description': description,
        'materialId': catalog_by_name.get(description), 'tradeId': trade_by_name.get(description),
        'quantity': sheet[f'C{r}'].value or 0, 'sections': sheet[f'F{r}'].value,
        'unitCostOverride': None if cost_cell.data_type == 'f' else cost_cell.value,
        'hours': sheet[f'I{r}'].value or 0, 'resale': sheet[f'G{r}'].value == 'Resale'})
quote = {'schemaVersion': 1, 'assumptionsVersion': 'fonroche-v27-' + digest[:12],
         'commission': cached['Quote Builder']['C3'].value or 0,
         'settings': settings, 'trades': trades, 'catalog': catalog, 'lines': lines, 'takeoffs': takeoffs}
fixture = {'source': {'filename': source.name, 'sha256': digest,
    'note': 'Cached upstream estimator outputs are frozen inputs in this first slice. No external links are fetched.',
    'inputSources': input_sources,
    'intentionalDifference': 'Quote Builder!N36 is a literal 1250. Preserve as priceOverride; retain the template PM formula separately.'},
    'quote': quote, 'expected': {'lines': expectations, 'price': cached['Quote Builder']['P43'].value,
    'buildBudget': cached['Quote Builder']['T43'].value, 'hoursAllowed': cached['Quote Builder']['R43'].value,
    'laborRate': cached['Settings']['B7'].value,
    'tradeHours': {trade['id']: sum((cached['Takeoffs'][f'J{r}'].value or 0) for r in range(5, 501) if cached['Takeoffs'][f'B{r}'].value == trade['name']) for trade in trades}}}
destination = pathlib.Path(__file__).resolve().parents[2] / 'tests/fixtures/quote-v27/fonroche.json'
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + '\n')
print(f'Extracted {len(lines)} lines, {len(takeoffs)} takeoffs, {len(catalog)} catalog entries to {destination}')

# Runtime picker excludes one whitespace-only unused catalog row in the source.
runtime_quote = dict(quote, catalog=[row for row in catalog if row['name'].strip()])
def value(sheet, cell):
    return cached[sheet][cell].value or 0

def yes(sheet, cell):
    return cached[sheet][cell].value == 'Yes'

installers = {}
for key, col, line_id in [('lead', 'B', 'line-28'), ('second', 'C', 'line-29'), ('third', 'D', 'line-30')]:
    installers[key] = dict(installDays=value('Install Labor', col+'5'), offDays=value('Install Labor', col+'6'),
                          dismantleDays=value('Install Labor', col+'7'), travelDaysOverride=None, lineId=line_id)
installers['support'] = dict(installDays=value('Install Labor', 'B29'), dismantleDays=value('Install Labor', 'C29'),
                             offDays=value('Install Labor', 'D29'), lineId='line-31')
people = {}
for key, col in [('lead', 'B'), ('pm', 'C'), ('second', 'D'), ('third', 'E')]:
    people[key] = dict(traveling=yes('Travel Estimator', col+'5'), installDays=value('Travel Estimator', col+'6'),
                       offDays=value('Travel Estimator', col+'7'), dismantleDays=value('Travel Estimator', col+'8'),
                       useInstallDays=key in ('second', 'third'), stays=yes('Travel Estimator', col+'9'),
                       daysPerTrip=value('Travel Estimator', col+'10'), hotelAdjustment=value('Travel Estimator', col+'11'),
                       roadBonus=yes('Travel Estimator', col+'12'))
travel_rates = {key: value('Travel Estimator', 'B'+str(r)) for key,r in
                dict(airfare=22,hotel=23,perDiem=24,vehicle=25,vehicles=26,baggage=27,roadBonus=28,other=29).items()}
shipping = {'rates': {key:value('Shipping Estimator', 'B'+str(r)) for key,r in
             dict(fuel=22,mpg=23,wear=24,rentalDay=25,rentalMile=26,driverDay=27,milesPerDay=28).items()}, 'lineId':'line-41'}
for key,col in [('outbound','B'),('return','C')]:
    shipping[key] = dict(enabled=yes('Shipping Estimator', col+'5'),mode=cached['Shipping Estimator'][col+'6'].value,
                         driver=cached['Shipping Estimator'][col+'8'].value,miles=value('Shipping Estimator',col+'7'),
                         carrierQuote=value('Shipping Estimator',col+'9'),misc=value('Shipping Estimator',col+'10'))
runtime_quote['estimators'] = dict(version=1,install=installers,
    travel=dict(people=people,rates=travel_rates,leadLineId='line-32',otherLineId='line-34',pmLineId='line-33'),
    shipping=shipping,beMatrix=dict(frameRental=value('beMatrix Estimator','B5'),frameWidth=value('beMatrix Estimator','B6'),
                                  frameHeight=value('beMatrix Estimator','B7'),walls=[]))
# Linked formulas now supply these inputs; disconnecting must not revive stale cached totals.
for line in runtime_quote['lines']:
    fields = {'line-28':['siteDays','cost'],'line-29':['siteDays','cost'],'line-30':['siteDays','cost'],
              'line-31':['siteDays','cost'],'line-32':['cost'],'line-34':['cost'],'line-33':['travelDays'],'line-41':['cost']}.get(line['id'],[])
    for field in fields:
        line['inputs'][field] = 0
runtime_path = pathlib.Path(__file__).resolve().parents[2] / 'src/data/quote-v27-fonroche.json'
runtime_path.parent.mkdir(parents=True, exist_ok=True)
runtime_path.write_text(json.dumps(runtime_quote, indent=2, ensure_ascii=False) + '\n')
