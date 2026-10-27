import {capacityTrade} from './capacity-trades';
/** Stable stage colors in every grouping; overtime is marked separately. */
export const TEAM_STAGE_COLORS:Record<string,string>={
 'CAD':'#7653a3','Turnover':'#277c78','CNC':'#326b9b','Carpentry':'#92662f',
 'Finish/Paint':'#aa4d76','Graphic/Vinyl':'#547f35','Packing / I&D':'#5263a4',
 'Electrical':'#946f13','Metal':'#586775','Sculpting':'#a15536','Other':'#676767',
};
export function teamStage(trade:string):string{
 const pool=capacityTrade(trade),key=pool.trim().toLowerCase();
 if(key.includes('cad')||key==='design')return 'CAD';
 if(key.includes('cnc'))return 'CNC';
 if(pool==='Carpentry')return 'Carpentry';
 if(pool==='Finish / Paint')return 'Finish/Paint';
 if(pool==='Graphic / Vinyl Install')return 'Graphic/Vinyl';
 if(pool==='Crate & pack'||key==='i&d')return 'Packing / I&D';
 if(key.includes('electrical'))return 'Electrical';
 if(key.includes('metal'))return 'Metal';
 if(key.includes('sculpt'))return 'Sculpting';
 return 'Other';
}
