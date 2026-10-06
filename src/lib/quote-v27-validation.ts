import {parsePlanning} from './capacity';
import {parseSchedule} from './quote-schedule';
import { parseEstimators } from './quote-v27-estimators';
import { calculateQuoteV27, EMPTY_INPUTS, LINE_TYPES, type QuoteV27, type Settings } from './quote-v27';

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected an object.');
  return value as Record<string, unknown>;
}
function text(value: unknown, label: string, max = 2000): string {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${label} is required (maximum ${max} characters).`);
  return value;
}
function num(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1e12) throw new Error('Numbers must be between 0 and 1 trillion.');
  return value;
}
function optionalText(row: Record<string, unknown>, key: string, max: number): Record<string,string> {
  if (row[key] === undefined) return {};
  if (typeof row[key] !== 'string' || row[key].length > max) throw new Error(`${key} must be at most ${max} characters.`);
  return {[key]: row[key]};
}
const nullable = (value: unknown) => value === null ? null : num(value);
const id = (value: unknown) => text(value, 'ID', 200);
const nullableId = (value: unknown) => value === null ? null : id(value);
function bool(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new Error('Expected a true/false value.');
  return value;
}
function list(value: unknown, max: number): Record<string, unknown>[] {
  if (!Array.isArray(value) || value.length > max) throw new Error(`Expected a list with at most ${max} entries.`);
  return value.map(record);
}
const settingKeys = ['contingency','opex','indirect','laborSell','materialMarkup','shopDay','efficiency','graphicsSell','graphicsCost','handlingMinutes','handlingCrew','designSell','pmFee','pmBonus','leadDay','supportDay','travelFactor','pmTravelDay','siteHours','supportCost','offFactor','equipmentMarkup','resaleMarkup','travelMarkup','freightMarkup','burdenMultiplier'] as const;

/** Reconstruct only known fields; reject malformed persisted/request snapshots before use. */
export function parseQuoteV27(value: unknown): QuoteV27 {
  const v = record(value), settings = record(v.settings);
  if (v.schemaVersion !== 1) throw new Error('Unsupported workbook version.');
  const parsed: QuoteV27 = {
    schemaVersion: 1, assumptionsVersion: text(v.assumptionsVersion, 'Assumptions version', 200),
    commission: num(v.commission),
    settings: { ...Object.fromEntries(settingKeys.map(key => [key, num(settings[key])])), burdenedRateOverride: nullable(settings.burdenedRateOverride) } as Settings,
    trades: list(v.trades, 100).map(row => ({ id: id(row.id), name: text(row.name, 'Trade name'), wage: nullable(row.wage) })),
    catalog: list(v.catalog, 2000).map(row => ({id:id(row.id),name:text(row.name,'Material name'),unit:typeof row.unit === 'string' && row.unit.length <= 200 ? row.unit : '',unitCost:num(row.unitCost)})),
    takeoffs: list(v.takeoffs, 5000).map(row => ({id:id(row.id),lineId:row.lineId===''?'':id(row.lineId),description:text(row.description,'Takeoff description'),materialId:nullableId(row.materialId),tradeId:nullableId(row.tradeId),quantity:num(row.quantity),sections:nullable(row.sections),unitCostOverride:nullable(row.unitCostOverride),hours:num(row.hours),resale:bool(row.resale),...optionalText(row,'unit',200),...optionalText(row,'notes',2000)})),
    lines: list(v.lines, 200).map(row => {
      const inputs = record(row.inputs), overrides = record(row.overrides);
      if (!(LINE_TYPES as readonly unknown[]).includes(row.type)) throw new Error('Unknown line type.');
      return {id:id(row.id),name:text(row.name,'Line name'),type:row.type as QuoteV27['lines'][number]['type'],takeoffDriven:bool(row.takeoffDriven),
        inputs:Object.fromEntries(Object.keys(EMPTY_INPUTS).map(key => [key,num(inputs[key])])) as QuoteV27['lines'][number]['inputs'],
        overrides:Object.fromEntries(Object.keys(EMPTY_INPUTS).filter(key => overrides[key] !== undefined).map(key => [key,nullable(overrides[key])])),
        priceOverride:nullable(row.priceOverride)};
    }),
  };
  if(v.planning!==undefined)parsed.planning=parsePlanning(v.planning);
  if(v.schedule!==undefined)parsed.schedule=parseSchedule(v.schedule);
  if(v.estimators !== undefined) parsed.estimators=parseEstimators(v.estimators);
  if(v.reusableItemIds!==undefined){
    if(!Array.isArray(v.reusableItemIds)||v.reusableItemIds.length>200)throw new Error('Invalid reusable item list.');
    parsed.reusableItemIds=v.reusableItemIds.map(id);
    if(parsed.reusableItemIds.some(id=>!parsed.lines.some(line=>line.id===id)))throw new Error('Reusable item is missing.');
  }
  if(v.catalogUsage!==undefined){const usage=Object.entries(record(v.catalogUsage));if(usage.length>2000)throw new Error('Too many catalog preferences.');parsed.catalogUsage=Object.fromEntries(usage.map(([name,count])=>[text(name,'Material name'),num(count)]));}
  calculateQuoteV27(parsed);
  return parsed;
}
