# Mecca Quote Workbook Audit

**Files inspected read-only**
- `/Users/archie/.hermes/attachments/Mecca_Quote_Builder_v8.xlsx`
- `/Users/archie/.hermes/attachments/Mecca_Quote_Template - Whatnot v2.xlsx`

Inspection used `openpyxl` with formulas and cached values, plus validations, hidden dimensions, merges, tables, names, styles, and formula-reference scans. Neither workbook has defined names, Excel tables, hidden rows/columns, or merged cells. Both have `fullCalcOnLoad=True`; openpyxl does not calculate formulas.

## Executive findings

1. **v8 is the structurally complete builder**: Settings, Travel Estimator, Takeoffs, Quote Builder, Client Quote, Budget Handoff, and Legacy Decoder. Whatnot is a filled example derived from an older/reduced schema: it has no Travel Estimator, adds Notes, and has fewer/shifted columns.
2. **Whatnot’s cached result is a $356,674.20 quote** (Quote Builder `O36`, Client Quote `C41`), with `$156,009.50` build budget (`S36`), `$17,833.71` contingency (`T36`), `$14,266.968` levy (`U36`), and `$168,564.022` margin after reserve/levy (`V36`). These are cached spreadsheet values, not freshly recalculated in this inspection.
3. **Whatnot has a visible formula/data defect**: `Quote Builder!W5` contains the literal `0.04`, although `W` is the Margin % column and sibling rows use the margin formula. `W5` should be reviewed/recalculated; it currently displays 4% for Lower Walls despite the row’s cached margin dollars of `$57,289.9392` on `$120,513.12` (about 47.54%).
4. **Whatnot contains numeric-looking text inputs**: `Quote Builder!I21` and `I22` are strings `'3.5'`; `L21` is the stray string `'e'`; `M24`, `M25`, and `N26` are strings such as `'6656.0'`/`'6890.0'`. Formulas often use `N()` and cached values reflect prior numeric calculations, so current Excel recalculation may yield zeros or different results. Normalize these cells to numeric values before relying on the example.
5. **v8 supports resale parts inside fabrication items; Whatnot does not**. v8 separates normal material and resale material (`Quote Builder!C:D`) and uses `Takeoffs!G` as a resale flag. Whatnot has only a single material-cost rollup (`Quote Builder!C`) and no resale flag, so a sourced part inside a fabricated item cannot be priced at the resale markup without manual intervention.
6. **v8 separates install and dismantle and includes Event/Off Days**. Whatnot has install and dismantle but no Event/Off Days line type/row. This matters when the crew remains in-market; v8’s travel sheet feeds that row.
7. **No production tracking schema exists in either workbook** beyond Budget Handoff: line item, type, materials/other budget, hours allowed, notes. Tracker should preserve this display schema and add operational IDs/status/actuals outside the quote math rather than exposing the client price as the production budget.

## Sheet-by-sheet audit — v8 builder

### `Settings`
**Purpose:** one-source rate and policy card; line-type dropdown source.

**Inputs/rates:** `B4` contingency 5% of sell; `B5` OpEx recovery 35%; `B6` indirect labor levy 4%; `B7` burdened labor cost $41/hr; `B8` labor sell $110/hr; `B11` materials markup 2.08x; `B12` shop day 8 hr; `B13` task-hour efficiency 1.0; `B16` graphics/SEG sell $25/sqft; `B17` graphics/SEG cost $6.50/sqft; `B18` beMatrix handling 12.5 min/panel; `B19` handling crew 2; `B22` design rate $125/hr; `B23` PM fee 3%; `B24` PM loaded cost $0/hr; `B27` lead day sell $1,995; `B28` support day sell $1,495; `B29` travel-day factor 0.5; `B30` PM travel-day sell $1,495; `B31` site day 10 hr; `B32` support cost $750/day; `B33` event/off factor 0.5; `B36` equipment markup 1.6x; `B37` props/resale 1.6x; `B38` travel/expenses markup 0.6x; `B39` freight markup 0.6x. See `Settings!A4:C39`.

**Line types:** `Settings!A42:A57`: Fabrication, Graphics, beMatrix / SEG, Design / Engineering / CAD, Lead Installer — Install, Lead Installer — Dismantle, Event / Off Days — Lead, Install Support Labor, Travel — Lead Installer, Travel — Project Manager, Stage / Pack / Prep, Disposal, Equipment Rental, Props / Resale, Travel & Expenses, Freight. PM deliberately is not a line type (`A59`).

**Validation:** none. Yellow rate cells are style-based, not protected/validated. Open question: should rate ranges be constrained to nonnegative values and versioned/effective-dated?

### `Travel Estimator`
**Purpose:** converts trip shape and crew assumptions into travel expense cost and two builder inputs.

**Inputs:** trip shape `B5:B11` (install days, event days, off days, dismantle days, stay-through-event Yes/No, travel days/round trip, hotel-night adjustment); crew `B14:B17` (travelers, leads, people/room, rental vehicles); unit costs `B20:B26` (airfare, hotel, per diem, vehicle, baggage/misc, road bonus, other lump). `B9` has list validation `"Yes,No"`.

**Flow:** round trips `B29=IF(B9="No",2,1)`; market days `B30`; travel days `B31`; road days `B32`; hotel nights `B33`; rooms `B34`. Cost components `B37:B43` sum to total cost `B44`. Client price `B48=B44*(1+B47)` and margin `B49=B48-B44`; markup is linked from `Settings!B38` at `B47`.

**Handoff:** `B52=B44` (cost for Quote Builder Travel & Expenses cost column), `B53=B31` (lead travel days), `B54=IF(B9="No",0,B6+B7)` (event/off site days). Exact labels/citations: `Travel Estimator!A51:C54`.

**Risks/open questions:** blank required inputs safely coerce to zero via `N()`, potentially hiding an incomplete trip. Hotel nights formula `B33=B30+B29+B11` adds one arrival night per trip but needs business confirmation for same-day travel/checkout. “Travel days” and “road days” use different bases; confirm whether per diem and vehicles should cover all road days. PM travel is not generated by this tab; builder row must be populated separately.

### `Takeoffs`
**Purpose:** item/work-package scratchpad: material allowances and labor task chunks, grouped by exact Quote Builder line-item name.

**Fields:** `A4:K4`: line item, description, qty, unit, unit cost, section multiplier, resale flag, material dollars, labor hours per section, extended hours, notes. Description list is `M5:M26` and line-item validation is `B5:B100` against `M5:M64` (note the list is in column M but the header says Description; the validation is actually on line-item column B in the workbook). `G5:G100` has list validation `"Resale"`.

**Formulas:** each material row `H5:H100 = IF(OR(C="",E=""),"",C*E*IF(F="",1,F))`; extended hours `J5:J100 = IF(I="","",I*IF(F="",1,F))`. Thus one-time rows blank in `F` are x1; section rows multiply material and labor.

**v8 rollup contract:** Quote Builder normal material `C5` uses `SUMIFS(Takeoffs!H5:H100, A, item, G, "<>Resale")`; resale part dollars `D5` uses the same with `G="Resale"`; labor `E5` sums `Takeoffs!J5:J100`. Exact pattern: `Quote Builder!C5:E5`, copied through rows `5:33`.

**Risks:** exact-name joins are case/spacing/punctuation sensitive; no validation prevents orphan takeoff line names. There is no numeric validation for quantity, cost, section multiplier, or hours; zeros and blanks have different behavior. Resale is a free-form list with only `Resale` allowed, but a typo silently falls into normal material. `M5:M26` is a manually maintained list and validation range extends to `M64`, leaving 27:64 blank.

### `Quote Builder`
**Purpose:** quote-line/work-item table, client price, production budget, reserve/levy/margin.

**Structure:** rows `5:19` are 15 item slots (although the instruction at `A2` says “Item 1-10”; rows `15:19` are additional spares). Rows `20:33` are standard lines. Inputs are `A:B` (name/type) and `C:M`: normal fab material, resale parts, hours, fab days, sqft, beMatrix panels, beMatrix rental charge, site days, travel days, support crew, other cost. Pricing/budget outputs are `N:X`: computed price, override, final price, materials/other budget, hours allowed, labor cost, build budget, contingency, indirect levy, margin dollars, margin percentage. Headers: `Quote Builder!A4:X4`.

**Price flow per row:** `N5` (copied down) branches by line type: fabrication = normal material × `Settings!B11` + resale × `B37` + labor hours/day conversion × `B8`; graphics = sqft × `B16` + hours × `B8`; SEG = rental charge + sqft × `B16`; design = hours × `B22`; install/dismantle = site days × `B27`; event/off = site days × `B27*B33`; support = days × crew × `B28`; travel labor = travel days × day rate × `B29`; stage/disposal = hours × `B8` plus dump cost for disposal; equipment = cost × `B36`; props = costs × `B37`; travel expenses = cost × `(1+B38)`; freight = cost × `(1+B39)`. Exact full formula: `Quote Builder!N5`.

`P5=IF(O5<>"",O5,N5)` chooses override or computed price (`P5:P33`). `Q5` is the cost/material budget by type; `R5` is hours allowed (fabrication uses entered hours/efficiency, otherwise days × shop day; graphics/design/stage/disposal direct hours; SEG handling minutes × crew/60; install/event/travel days × site hours; support has no direct hours). `S5=R5*Settings!B7`; `T5=Q5+S5`; `U5=P5*B4`; `V5=P5*B6`; `W5=P5-T5-U5-V5`; `X5=W5/P5` with zero-price guard. Exact formulas: `Quote Builder!Q5:X5`.

**Totals/PM:** subtotal `N34,P34:W34` sums rows 5:33. PM fee `P35=Settings!B23*(P34 - Travel & Expenses - Freight)`; PM hours `Q35=P35/Settings!B8`; PM cost `R35=Q35*Settings!B24`; PM reserve/levy/margin `T35:W35`; grand total `P36=P34+P35`, `R36=R34+R35`, `S36=S34+S35`, `T36=T34+S35`, `U36=U34+U35`, `V36=V34+V35`, `W36=W34+W35`. Note `S36` adds PM labor cost, while `T36` adds `S35` (not `T35`) because PM cost is included in build budget and PM reserve/levy are tracked separately. Economics are `C39:C46`; discount check `C46=P34-N34`.

**Material risks:** row formulas are duplicated rather than table-driven; adding/inserting rows can break hard-coded ranges and handoff arrays. Price override affects reserves, levy, margin and client quote but not budgets; this is intended, but overrides must be audited. Empty named rows have formula zeros/blank behavior that differs between cached and freshly calculated files. No numeric validation on inputs, no data-entry completeness checks, and no warning for a line type with irrelevant fields populated. A fabrication row prioritizes entered hours over fab days (`IF(E>0,E,F*shopday)`), so entering both silently ignores days.

### `Client Quote`
**Purpose:** client-facing handoff. Header metadata fields `B5:B8` are blank (Client, Project, Date, Quote #). Lines `B11:C40` pull nonzero Quote Builder final prices; PM is `B40:C40`; total is `B41:C41`; validity disclaimer is `B43`. Formulas `B11:C40` filter when name/type missing or final price is zero. This is the HubSpot-facing commercial summary, not the production detail.

### `Budget Handoff`
**Purpose:** production-facing output; rows `5:33` are filtered Quote Builder rows; `A:D` carry line name, type, materials/other budget, hours allowed; `E` provides a type-specific note from an inline `INDEX`/`MATCH` array. Key formulas `Budget Handoff!A5:E5`, copied down; PM row `D34=Quote Builder!R35`; reserve `C36=Quote Builder!U36`.

**Tracker display schema:** preserve `A4:E4` exactly as the base display: Line item, Line type, Materials / other budget, Hours allowed, Notes for production. Add IDs, status, owner, actual committed/spent, actual hours, variance, and approval/change-order fields as separate operational fields. Do not map `Client Quote!C` directly to production budget.

### `Legacy Decoder`
**Purpose:** reverse-engineers old quote-only lines into production budget. Old pricing assumptions are explicit inputs `D3=$105 labor sell/hr`, `F3=2.0x material markup`; lines `A6:J25` accept item, discipline, sell price, fab quoted hours/days, sqft, panels, install/travel days, support crew, and other budget. Outputs `K:R` calculate materials/other, hours, labor cost, build budget, reserve, levy, margin, margin %. Formulas are repeated by row; validation on `B6:B25` references `A29:A34`. Fallback when fabrication hours/days are absent is 50/50 of sell less materials markup. Risk: legacy discipline `Install` is a single bucket and cannot distinguish install vs dismantle; legacy formulas use live `Settings` for some costs while old sell/markup are in `D3/F3`, so historical reconstruction needs review.

## Sheet-by-sheet audit — Whatnot example

### `Settings`
Same basic rate card but changed assumptions: PM fee `B23=2%` (vs v8 3%); equipment markup `B35=1.5x` (v8 `B36=1.6x`); props `B36=1.6x`; travel/expenses `B37=0.2x` (v8 `B38=0.6x`); freight `B38=0.15x` (v8 `B39=0.6x`); design rate still $125 but labeled assumed at `C22`. Event/off factor and line type are absent. Line types are `A41:A55`, 15 types, with no Event / Off Days — Lead.

### `Takeoffs`
Example is populated and uses `A:J`, no resale column/list. `A4:J4` fields are line item, description, qty, unit, unit cost, section x, material $, labor hrs per section, ext hrs, notes. Formula rollups are `G5:G101` for material and `I5:I101` for extended hours. Populated work packages include Lower Walls (`A5:A15`), Stage (`A18:A22`), Marquee (`A25:A31`), Bench/Planter (`A37:A42`), Railing (`A46:A51`), Whatnot Plex (`A56:A66`), Wall Signs/Columns/Details (`A69:A72`), and Stage, pack & prep (`A34`). Placeholder rows use `B23:B24`, etc. There is no validation for material descriptions; `B` values are free text. All material is treated as normal material in Quote Builder.

### `Quote Builder`
Whatnot uses the same conceptual table but shifted to `A:W`: normal material `C`, hours `D`, fab days `E`, sqft `F`, panels `G`, rental `H`, site days `I`, travel days `J`, support crew `K`, other cost `L`, computed price `M`, override `N`, final `O`, budget `P`, hours `Q`, labor cost `R`, build `S`, reserve `T`, levy `U`, margin `V`, margin % `W`. Exact headers: `Quote Builder!A4:W4`.

Populated items are rows `5:14`: Lower Walls, Stage, Marquee, Upper Walls, SEG Back Wall, Bench/Planter, Railing, Planter Greenery, Whatnot Plex, Wall Signs/Columns/Details. Key hardcoded overrides/costs: `N6=15,220` Stage price override; `L8=21,579` Upper Walls cost; `L9=17,000` SEG Back Wall cost; `L12=6,000` Planter Greenery cost; `N26=6,890` stage/pack price override; `O35=4,500` PM fee override. Install/dismantle site days `I21=3.5`, `I22=3.5`; travel expense-like hardcoded costs `M24=6,656`, `M25=6,656`. `L21='e'` is a stray text input.

**Cached line outputs:** Lower Walls `O5=120,513.12`, Stage `O6=15,220`, Marquee `O7=18,215.84`, Upper Walls `O8=34,526.40`, SEG Back Wall `O9=27,200`, Bench/Planter `O10=20,971.92`, Railing `O11=10,288.32`, Planter Greenery `O12=9,600`, Whatnot Plex `O13=30,900.80`, Wall Signs `O14=21,820.80`; design `O20=8,750`, install `O21=6,982.50`, dismantle `O22=6,982.50`, travel lead/PM `O24:O25=6,656`, stage/pack `O26=6,890`, PM `O35=4,500`. Subtotal `O34=352,174.20`; grand total `O36=356,674.20`.

**Formula/data risks:** Whatnot computed price is `M5` and final is `O5`; the formula has no resale-parts branch. Its budget formula `P5` uses only `C` for fabrication material, and `Q5` uses extended hours. `W5` is a literal 0.04 rather than the `W6` margin formula. Whatnot uses `N($I21)`/similar coercion; text numbers can recalculate to zero. There is no Travel Estimator link or schedule source, so `M24/M25` are manually typed and opaque.

### `Client Quote`
Whatnot line names are hardcoded/formula-mixed: `B11='Lower Walls'` is literal while later rows are formulas. Prices `C11:C40` pull `Quote Builder!O`; total `C41=Quote Builder!O36`. Metadata `B5:B8` remains blank. Client total is `$356,674.20` cached (`C41`).

### `Budget Handoff`
Same display layout `A4:E4`; formulas point to Whatnot columns (`O` final price, `P` materials/other, `Q` hours). Cached rows 5:14 carry production budgets: Lower Walls `$33,189`/468 hr; Stage `$3,750`/52 hr; Marquee `$5,373`/64 hr; Upper Walls `$21,579`/0; SEG `$17,000`/0; Bench `$6,486.50`/68; Railing `$3,254`/32; Greenery `$6,000`/0; Plex `$8,510`/120; Wall Signs `$6,260`/80. PM row `D34=40.9091` hours; reserve `C36=$17,833.71`. Notes are inline arrays and differ from v8 by omitting Event/Off Days and using the reduced 15-type order.

### `Legacy Decoder`
Structurally the same as v8, with no populated legacy rows. `Notes` is an additional Whatnot-only sheet containing future-work reminders at `A3:A6` (Travel Calculator; resale parts in fabrication items).

## Quote line/work-item and trade/labor model

- **Item/work package:** each Quote Builder row `5:19` is intended to be one named production package (e.g., Lower Walls, Stage, Marquee), with Takeoffs rows grouped under the exact same name. v8 supports up to 15 item slots despite the “1-10” instruction; Whatnot fills 10.
- **Install/dismantle:** separate v8 rows `21:22`; Whatnot `21:22`. This matches the requested modeling convention.
- **Trade/labor:** trade detail is represented in Takeoffs descriptions and labor task rows (`CNC + cutting`, `Carpentry`, `Assembly`, `Painting`, `Graphic Install`, `Finish`, `Electrical`, `Metal Work`, etc.), with extended labor hours rolled into each quote item. It is not a separate trade field in the handoff; Tracker needs a trade/task child structure if trade-level actuals are required.
- **Labor pricing:** internal cost is generally `Settings!B7=$41/hr`; sell is `B8=$110/hr`; install/lead/support use day rate card; design uses `B22`; SEG handling converts panel minutes and crew to hours; PM uses a percentage fee and `B24=$0` cost.

## Mapping recommendations

### HubSpot (commercial/CRM)
- Deal/project: Client Quote metadata `Client Quote!B5:B8`; quote status/validity from `B43`; total `Client Quote!C41`; PM fee `C40`.
- Quote line items: `Client Quote!B11:C40` or source `Quote Builder!A5:B33` plus final price `P` (v8) / `O` (Whatnot), line type, and override flag.
- Preserve internal-only fields separately: computed price (`N`/`M`), cost budget (`Q`/`P`), hours allowed (`R`/`Q`), build budget (`T`/`S`), reserve, levy, margin. Do not expose these to client-facing quote properties unless intentionally permissioned.

### Tracker (production)
- Parent project/deal ID from HubSpot.
- Base display exactly `Budget Handoff!A4:E4`: line item, line type, materials/other budget, hours allowed, notes.
- Add operational fields: work-item ID, parent item ID, trade/task, install vs dismantle phase, owner, status, committed cost, actual cost, logged hours, variance, approval/change-order ID, contingency draw. Takeoffs `A:K`/`A:J` are the proto-BOM/task source; retain description, quantity, unit, unit cost, section multiplier, material cost, labor hours, notes.
- Map v8 resale flag `Takeoffs!G` and separate `Quote Builder!D` into a procurement/resale classification. Whatnot cannot be losslessly mapped for embedded resale parts.

### QBT (QuickBooks/finance)
- Sales invoice/estimate lines: final prices from Client Quote / Quote Builder final-price column, grouped by line type or item.
- Cost/budget tracking: materials/other budget, labor hours × burdened cost, equipment/props/travel/freight cost buckets; preserve cost-vs-sell distinction.
- Suggested class/item mapping: Fabrication, Graphics, SEG, Design, Install, Dismantle, Event/Off Days, Support Labor, Stage/Pack, Disposal, Equipment, Props/Resale, Travel & Expenses, Freight. Require confirmation of QBT item/service names, tax treatment, classes, and whether contingency is billed or internal reserve.

## Exact open questions

1. What are the required HubSpot fields for Client, Project, Date, Quote # (`Client Quote!B5:B8`), and is quote number generated upstream?
2. Should HubSpot store one line per item/work package or split by trade/task from Takeoffs? If split, what is the stable parent-child ID convention?
3. Confirm whether `Quote Builder!A5:A19` is 15 item slots (as implemented) or only 10 (as stated in `A2`).
4. Confirm the authoritative PM fee rate: v8 `Settings!B23=3%` vs Whatnot `B23=2%`; is PM fee manually overridable (`P35`/`O35`) and what approval is required?
5. Confirm the source and effective date for design rate, lead/support rates, PM travel rate, site hours, support cost, equipment markup, travel markup, and freight markup (`Settings!B22:B39`).
6. Confirm whether event/off-day lead labor should be mandatory whenever the crew stays in-market and whether support labor also applies on those days.
7. Confirm whether Travel Estimator required fields may remain blank/zero, and who owns assumptions when schedule changes (`Travel Estimator!B5:B26`).
8. Confirm whether PM travel should be derived from the travel estimator or entered manually as a separate person/traveler assumption.
9. Confirm whether `Travel & Expenses` and `Freight` are intentionally excluded from PM fee base (`Quote Builder!P35` / Whatnot equivalent) and whether contingency/levy still apply to them (currently yes).
10. Confirm QBT treatment of contingency: internal reserve only vs invoiceable line; current workbook computes reserve from sell (`Quote Builder!U/T`) and says it is not spent.
11. Confirm whether the 35% OpEx recovery and PM fee are intentionally additive, given PM loaded cost is `$0` (`Settings!B5`, `B23:B24`).
12. Confirm how Mecca-owned equipment should be represented: blank cost plus manual price override, or a distinct zero-cost equipment item (`Settings!C36`).
13. Confirm whether normal materials and resale materials must be separately tracked in Tracker/QBT; v8 supports this, Whatnot does not.
14. Confirm what `Quote Builder!L21='e'` means and whether it is an accidental entry; normalize all numeric-looking text cells in the Whatnot example.
15. Confirm whether Whatnot `W5=0.04` is accidental and should be replaced with the copied margin formula used in `W6:W14`.
16. Confirm whether client metadata and quote lines should be formula-linked rather than hardcoded (`Whatnot Client Quote!B11` vs `B12:B40`).
17. Confirm required validation rules: nonnegative qty/cost/hours/days, required line type when line item exists, exact-name integrity between Takeoffs and Quote Builder, and warnings for both hours and days populated.
18. Confirm whether Legacy Decoder’s fallback and mixed old/live rate references are acceptable for historical audit (`Legacy Decoder!K6:R25`).
19. Confirm QBT chart-of-account/item mappings, taxability, classes, and whether travel/freight markups are revenue or pass-through treatment.
20. Confirm whether production actuals should be committed (POs + logged hours) as the handoff notes say (`Budget Handoff!A38`), and where those actuals live.

## Verification notes

- Both workbooks: no hidden rows/columns, no merged cells, no tables, no defined names; all sheets visible.
- v8 formula references include `Settings`, `Takeoffs`, and `Travel Estimator`; Whatnot has no `Travel Estimator` sheet and no formulas referencing it.
- Formula caches exist in the Whatnot example and are materially populated; v8 is mostly an unfilled builder and has many `None` cached formula results. Treat v8 results as requiring Excel recalculation.
- No source workbook was edited.

