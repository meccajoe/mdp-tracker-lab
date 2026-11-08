import {capacityTrade} from './capacity-trades';
/** Stable stage colors in every grouping; overtime is marked separately. */
export const TEAM_STAGE_COLORS:Record<string,string>={
 'CAD':'#e5ddf5','Turnover':'#d4eee8','CNC':'#d5e8f7','Carpentry':'#f0e1cb',
 'Finish/Paint':'#f3dce8','Graphic/Vinyl':'#dfedd4','Packing / I&D':'#dde2f7',
 'Electrical':'#f6edcb','Metal':'#dfe6eb','Sculpting':'#f4dfd4','Other':'#e6e7ea',
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
