export const FORECAST_STATUSES=['Not likely','Possible','Likely','Highly likely','Closed won','In production','Lost','Completed'] as const;
export type ForecastStatus=typeof FORECAST_STATUSES[number];
export type QuoteSchedule={installDate:string;buildStart:string;buildFinish:string;status:ForecastStatus|''};
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
 schedule.status=row.status as QuoteSchedule['status'];
 if(schedule.buildStart&&schedule.buildFinish&&schedule.buildFinish<schedule.buildStart)throw new Error('Build finish must be on or after build start.');
 return schedule;
}
