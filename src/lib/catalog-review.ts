import type {CatalogEntry} from './tracker-catalog';

// Exact equivalents reviewed against the live catalog on 2026-11-08.
// Do not broaden by fuzzy name matching: species, grade, finish and package matter.
export const reviewedCatalogGroups: readonly (readonly string[])[] = [
  [
    "1\" MDF (4'x8')",
    "MDF 1\" 4X8"
  ],
  [
    "1\" MDF (5'x10')",
    "MDF 1\" 5x10"
  ],
  [
    "1\" MDF (5'x12')",
    "1\" MDF 5x12",
    "MDF 1\" 5x12"
  ],
  [
    "1/2\" MDF (4'x8')",
    "1/2\" MDF 4x8",
    "MDF 1/2\" 4x8"
  ],
  [
    "1/2\" MDF (5'x10')",
    "MDF 1/2\" 5x10"
  ],
  [
    "1/2\" MDF (5'x12')",
    "MDF 1/2\" 5x12"
  ],
  [
    "1/4\" MDF (4'x8')",
    "MDF 1/4\" 4x8"
  ],
  [
    "1/4\" MDF (4'x10')",
    "MDF 1/4\" 4X10"
  ],
  [
    "1/4\" MDF (5'x10')",
    "MDF 1/4\" 5x10"
  ],
  [
    "1/8\" MDF (4'x8')",
    "1/8\" MDF 4x8",
    "MDF 1/8\" 4x8"
  ],
  [
    "3/4\" MDF (4'x8')",
    "3/4\" MDF 4x8",
    "MDF 3/4\" 4x8"
  ],
  [
    "3/4\" MDF (4'x10')",
    "MDF 3/4\" 4x10"
  ],
  [
    "3/4\" MDF (4'x12')",
    "MDF 3/4\" 4x12"
  ],
  [
    "3/4\" MDF (5'x10')",
    "MDF 3/4\" 5x10"
  ],
  [
    "3/4\" MDF (5'x12')",
    "MDF 3/4\" 5X12"
  ],
  [
    "3/4\" Maple Plywood (4'x8')",
    "Maple Plywood 3/4\" 4x8"
  ],
  [
    "B2 MAPLE PLYWOOD 3/4\" 4x8",
    "Maple Plywood B-2 3/4\" 4x8"
  ],
  [
    "1/4\" Lauan Plywood (4'x10')",
    "Luan Plywood 1/4\" 4x10"
  ],
  [
    "1/4\" Meranti Plywood (4'x10')",
    "4X10'-1/4 MERANTI PLYWOOD"
  ],
  [
    "3/4\" Melamine Black 2S MDF (4'x8')",
    "MELAMINE 3/4 4X8 BLACK 2S MDFC"
  ],
  [
    "3/4\" Melamine White 2S MDF (4'x8')",
    "MELAMINE 3/4 4X8 WHITE 2S MDF"
  ],
  [
    "Aluminum Sheet 4x8x.25",
    "Aluminum Sheet 4x8x0.25",
    "Aluminum Sheet 48x96x.25",
    "Aluminum Sheet 48x96x.250"
  ],
  [
    "Aluminum Sheet 4x10x.25",
    "Aluminum Sheet 48x120x.25",
    "Aluminum Sheet 48x120x.250"
  ],
  [
    "Mirror Polish Stainless Steel Sheet 4x10x16gauge",
    "Mirror Polish Stainless Steel Sheet 48x120x16ga"
  ],
  [
    "Sq. Steel Tubing 1x1x.125",
    "Steel Sq. Tubing 1x1x.125"
  ],
  [
    "Sq. Steel Tubing 3x3x14",
    "Steel Sq. Tubing 3x3x14"
  ],
  [
    "Double Sided Carpet Tape 2\"x 36yds",
    "Double Sided Carpet Tape 2\"x36yds"
  ],
  [
    "3M Tape 3M 2090 Painter's Masking Tape (BLUE) 1-1/2\" x 60 yds",
    "3M Tape 3M 2090 Painter's Masking Tape (BLUE) 1-1/2\" x 60 yds 3M"
  ],
  [
    "3M Tape 3M 2090 Painter's Masking Tape (BLUE) 2\" x 60 yds",
    "3M Tape 3M 2090 Painter's Masking Tape (BLUE) 2\" x 60 yds 3M"
  ]
];

export function catalogDuplicatePlan(entries:CatalogEntry[]){
 return reviewedCatalogGroups.flatMap(names=>{
  const matches=entries.filter(row=>!row.deletedAt&&names.includes(row.name));
  // Never compare prices across units or with incomplete pricing.
  const units=new Set(matches.map(row=>row.unit.trim().toLowerCase()));
  if(matches.length<2||units.size!==1||matches.some(row=>row.unitCost===null))return [];
  const sorted=[...matches].sort((a,b)=>b.unitCost!-a.unitCost!||a.name.localeCompare(b.name)||a.itemId.localeCompare(b.itemId));
  return [{keep:sorted[0],archive:sorted.slice(1)}];
 });
}
export function catalogUsageCount(name:string,usage:Record<string,number>){
 const group=reviewedCatalogGroups.find(names=>names.includes(name));
 return (group??[name]).reduce((sum,alias)=>sum+(usage[alias]??0),0);
}
