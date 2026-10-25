export const FORECAST_STATUSES=['Not likely','Possible','Likely','Highly likely','Closed won','In production','Lost','Completed'] as const;
export type ForecastStatus=typeof FORECAST_STATUSES[number];
export type QuoteSchedule={installDate:string;buildStart:string;buildFinish:string;status:ForecastStatus|'';projectStartOverride?:string;dismantleDate?:string;dueDate?:string;shipDate?:string;projectStatus?:ProjectStatus};
export const PROJECT_STATUSES=['Not Active','Active','Complete'] as const;
export type ProjectStatus=typeof PROJECT_STATUSES[number];
export const SALES_FORECAST_STATUSES=['Not likely','Possible','Likely','Highly likely','Closed won','Lost'] as const;
export function projectStatusFor(schedule?:{status?:string;projectStatus?:string},planningStatus=''):ProjectStatus{
 const status=planningStatus||schedule?.status;
 // Older workbook/capacity controls may still write these lifecycle values.
 if(status==='Completed')return 'Complete';
 if(status==='In production')return 'Active';
 if(PROJECT_STATUSES.includes(schedule?.projectStatus as ProjectStatus))return schedule!.projectStatus as ProjectStatus;
 return status==='Completed'?'Complete':status==='In production'||status==='Closed won'?'Active':'Not Active';
}
// Apply only an explicit forecast choice, never while reading historical schedules.
export function withForecastStatus(schedule:QuoteSchedule,status:QuoteSchedule['status']):QuoteSchedule{
 return {...schedule,status,...(status==='Closed won'?{projectStatus:'Active' as const}:{})};
}
export function salesForecast(status:string){return status==='In production'||status==='Completed'?'Closed won':status;}
export const EMPTY_SCHEDULE:QuoteSchedule={installDate:'',buildStart:'',buildFinish:'',status:''};
export function validDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const parsed=new Date(`${value}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value&&value>='1900-01-01'&&value<='2200-12-31';
}
export function parseSchedule(value:unknown):QuoteSchedule {
 if(!value||typeof value!=='object'||Array.isArray(value))throw new Error('Invalid quote schedule.');
 const row=value as Record<string,unknown>,schedule={...EMPTY_SCHEDULE};
 for(const key of ['installDate','buildStart','buildFinish'] as const){if(row[key]!==''&&!validDate(row[key]))throw new Error(`Choose a valid ${key} date.`);schedule[key]=row[key] as string;}
 if(row.status!==''&&!FORECAST_STATUSES.includes(row.status as ForecastStatus))throw new Error('Choose a valid forecast status.');
 for(const key of ['dueDate','shipDate','dismantleDate','projectStartOverride'] as const){if(row[key]!==undefined){if(row[key]!==''&&!validDate(row[key]))throw new Error(`Choose a valid ${key} date.`);schedule[key]=row[key] as string;}}
 if(row.projectStatus!==undefined){if(!PROJECT_STATUSES.includes(row.projectStatus as ProjectStatus))throw new Error('Choose a valid project status.');schedule.projectStatus=row.projectStatus as ProjectStatus;}
 schedule.status=row.status as QuoteSchedule['status'];
 if(schedule.projectStartOverride&&schedule.projectStartOverride!==schedule.buildStart)throw new Error('Revised Project Start must match the saved start date.');
 if(schedule.buildStart&&schedule.buildFinish&&schedule.buildFinish<schedule.buildStart)throw new Error('Project Finish must be on or after Project Start.');
 return schedule;
}

export const forecastLabel=(status:string)=>({'Not likely':'Not Likely','Highly likely':'Highly Likely','Closed won':'Closed Won',Lost:'Closed Lost'} as Record<string,string>)[status]??status;

/** Explicit planning changes supersede activation; older quotes retain activation fallback. */
export function effectiveProjectSchedule(schedule:QuoteSchedule,activationDate?:string):QuoteSchedule {
 return {...schedule,buildStart:schedule.projectStartOverride||activationDate||schedule.buildStart};
}
