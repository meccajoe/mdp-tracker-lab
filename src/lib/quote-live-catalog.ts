import { createHash } from 'node:crypto';
import type { Material } from './quote-v27';
export const MATERIALS_SHEET_ID = '1Z34DH5kc3c7K9g-yOUyzF_sEhhNPFZeIdfh1gMTNL-0';
export const MATERIALS_SHEET_GID = '1318845246';
export const MATERIALS_CSV_URL = `https://docs.google.com/spreadsheets/d/${MATERIALS_SHEET_ID}/export?format=csv&gid=${MATERIALS_SHEET_GID}`;

export function parseCatalogCsv(csv: string): { materials: Material[]; warnings: string[] } {
  if (csv.length > 2_000_000 || /^\s*</.test(csv)) throw new Error('Materials DB did not return a valid CSV export.');
  const rows: string[][] = []; let row: string[] = [], cell = '', quoted = false;
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    if (char === '"') {
      if (quoted && csv[i + 1] === '"') { cell += '"'; i++; }
      else if (quoted || cell === '') quoted = !quoted;
      else throw new Error('Malformed catalog CSV.');
    } else if (!quoted && (char === ',' || char === '\n')) {
      row.push(cell.replace(/\r$/, '')); cell = '';
      if (char === '\n') { rows.push(row); row = []; }
    } else cell += char;
  }
  if (quoted) throw new Error('Incomplete catalog CSV.');
  if (cell || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const header = rows[3]?.map(value => value.trim());
  if (header?.[0] !== 'Description' || header?.[1] !== 'Unit' || header?.[2] !== 'Unit cost $' || header?.[3] !== 'Type') throw new Error('Materials DB column headings changed.');
  const materials: Material[] = [], warnings: string[] = [];
  const names = new Set<string>(), duplicates = new Set<string>();
  for (let index = 4; index < Math.min(rows.length,1004); index++) {
    const [rawName='', rawUnit='', rawCost='', rawType=''] = rows[index];
    const name = rawName.trim(), unit = rawUnit.trim(), kind = rawType.trim();
    if (!name) continue;
    const costText = rawCost.replace(/[$,\s]/g, '');
    const unitCost = kind === 'Labor' && !costText ? 0 : Number(costText);
    if (name.length>2000 || unit.length>200 || (!costText && kind !== 'Labor') || !Number.isFinite(unitCost) || unitCost<0 || unitCost>1e12) {
      warnings.push(`Row ${index+1}: incomplete or invalid description, type, unit or price; excluded.`); continue;
    }
    if (names.has(name)) duplicates.add(name);
    names.add(name);
    // A changed price/unit gets a new identity, preserving catalog entries used by older rows.
    const id = 'live-' + createHash('sha256').update(JSON.stringify([name,unit,unitCost,kind])).digest('hex').slice(0,32);
    materials.push({id,name,unit,unitCost});
  }
  if (duplicates.size) warnings.push(`${duplicates.size} duplicate descriptions excluded; make descriptions unique in Materials DB.`);
  const unique = materials.filter(material => !duplicates.has(material.name));
  if (!unique.length || unique.length > 2000) throw new Error('Materials DB must contain 1–2000 valid unique entries.');
  return {materials: unique,warnings};
}

export async function fetchLiveCatalog(fetcher: typeof fetch = fetch) {
  const response = await fetcher(MATERIALS_CSV_URL, {cache:'no-store', signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error('Materials DB is unavailable. Check spreadsheet read access.');
  if (Number(response.headers.get('content-length')) > 2_000_000) throw new Error('Materials DB export is too large.');
  const parsed = parseCatalogCsv(await response.text());
  return {...parsed, fetchedAt:new Date().toISOString(), sourceSheetId:MATERIALS_SHEET_ID};
}
