import {type QuoteSchedule,validDate} from './quote-schedule';
import {dateString,dayNumber,type capacityProject} from './capacity';
import {productionDays,WEEKDAYS,type ProductionCalendar} from './production-calendar';

export const PRODUCTION_STAGES=[
  {id:'cad',name:'CAD / Drawings',percent:15,milestone:'Drawings ready',color:'#c9dff2',trades:[]},
  {id:'purchasing',name:'Purchasing / Production Ramp Up',percent:5,milestone:'Production ready',color:'#ded5f0',trades:[]},
  {id:'cnc',name:'CNC',percent:10,milestone:'CNC complete',color:'#bce4e4',trades:['cnc','cnc + cutting','cnc cutting','cnc + cut','cnc/cutting']},
  {id:'carpentry',name:'Carpentry / Assembly',percent:40,milestone:'Assembly complete',color:'#eed6af',trades:['carpentry','assembly','carpentry/assembly']},
  {id:'finish',name:'Finish / Paint',percent:20,milestone:'Finish complete',color:'#efcdd7',trades:['finish','painting','paint','finish/paint']},
  {id:'packing',name:'Final Prep / Packing',percent:10,milestone:'Ready for install',color:'#cde1bf',trades:['crate & pack','crate and pack','packing','final prep','stage / pack / prep']},
] as const;

/** Percentages divide the available workday duration, never labor hours or prices. */
export function projectTimeline(schedule:QuoteSchedule,calendar:ProductionCalendar=WEEKDAYS){
  const warnings:string[]=[];
  const days=productionDays(schedule.buildStart,schedule.buildFinish,calendar);
  if(!validDate(schedule.buildStart)||!validDate(schedule.buildFinish))warnings.push('Set Build start and Build finish in the quote header to create this timeline.');
  else if(schedule.buildFinish<schedule.buildStart)warnings.push('Build finish must be on or after Build start.');
  else if(!days.length)warnings.push('No working days fall inside these build dates. Enable the needed weekend day or change the dates.');
  if(!schedule.installDate)warnings.push('Install date is not set.');
  else if(validDate(schedule.installDate)&&validDate(schedule.buildFinish)&&schedule.installDate<schedule.buildFinish)warnings.push('Install is scheduled before Build finish. Review the quote dates.');
  if(days.length&&days.length<6)warnings.push('Short schedule: stages share dates. Fractional working days preserve all six stages and the exact percentages.');
  let cumulative=0;
  const stages=PRODUCTION_STAGES.map(stage=>{
    const from=days.length*cumulative/100;cumulative+=stage.percent;const to=days.length*cumulative/100;
    if(!days.length)return {...stage,start:'',finish:'',from:0,to:0,workdays:0};
    // At a whole-day boundary, the previous stage ends on that workday and
    // the next begins on the next enabled workday, even across weekends/DST.
    const first=Math.min(days.length-1,Math.floor(from+1e-9));
    const last=Math.min(days.length-1,Math.max(0,Math.ceil(to-1e-9)-1));
    return {...stage,start:dateString(days[first]),finish:dateString(days[last]),from:days[first]+(from-first),to:days[last]+(to-last),workdays:to-from};
  });
  const validDates=[schedule.buildStart,schedule.buildFinish,schedule.installDate].filter(validDate).map(dayNumber);
  const axisStart=validDates.length?Math.min(...validDates):0,axisEnd=validDates.length?Math.max(...validDates)+1:1;
  return {stages,workdays:days.length,warnings,axisStart,axisEnd};
}

/** Exact named-trade mapping; no guessed percentages of labor and no double counting. */
export function stageLabor(project:ReturnType<typeof capacityProject>){
  const hours:Record<string,number>={cad:project.demand.design};
  const other:Record<string,number>={};
  for(const [name,value] of Object.entries(project.trades)){
    const normalized=name.trim().toLowerCase();
    const stage=PRODUCTION_STAGES.find(stage=>(stage.trades as readonly string[]).includes(normalized));
    if(stage)hours[stage.id]=(hours[stage.id]??0)+value;else other[name]=value;
  }
  if(project.untyped)other['Untyped / other']=project.untyped;
  return {hours,other};
}
