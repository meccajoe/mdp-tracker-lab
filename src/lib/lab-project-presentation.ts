export function quotedWorkHours(lines:{type:string;hoursAllowed:number}[]){
 const groups={shop:0,design:0,install:0,dismantle:0,unclassified:0};
 for(const line of lines){const group=line.type==='Fabrication'?'shop':line.type==='Design / Engineering / CAD'?'design':line.type==='Installer Days'?'install':'unclassified';groups[group]+=line.hoursAllowed;}
 return groups;
}
export function healthMoney(budget:number,summary:{expenses:number;knownCost:number;complete:boolean}|null){
 if(!summary)return {cost:null,percent:null,remaining:null,incomplete:true};
 const cost=summary.expenses+summary.knownCost;
 return {cost,percent:budget>0?cost/budget*100:null,remaining:summary.complete?budget-cost:null,incomplete:!summary.complete};
}

const dateFormat=new Intl.DateTimeFormat('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'America/Chicago'});
export function projectDate(value:string|null|undefined){return value?dateFormat.format(new Date(value+'T12:00:00Z')):'Not set';}

const longMonth=new Intl.DateTimeFormat('en-US',{month:'long',timeZone:'UTC'});
export function readableProjectDate(value:string|null|undefined){
 if(!value||!/^\d{4}-\d{2}-\d{2}$/.test(value))return 'Not set';
 const date=new Date(value+'T12:00:00Z');
 if(!Number.isFinite(date.getTime())||date.toISOString().slice(0,10)!==value)return 'Not set';
 const day=date.getUTCDate(),suffix=day%100>=11&&day%100<=13?'th':({1:'st',2:'nd',3:'rd'}[day%10]??'th');
 return `${longMonth.format(date)} ${day}${suffix}, ${date.getUTCFullYear()}`;
}
