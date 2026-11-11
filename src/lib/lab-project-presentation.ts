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
