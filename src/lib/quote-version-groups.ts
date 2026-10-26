/** Presentation only: never infer groups from names or select a capacity version. */
export function groupQuoteVersions<T extends {id:string;capacity_group:string;capacity_selected:boolean;created_at:string}>(rows:T[],matches:(row:T)=>boolean,compare:(a:T,b:T)=>number){
 const grouped=new Map<string,T[]>();
 for(const row of rows){const key=row.capacity_group||row.id;const members=grouped.get(key)??[];members.push(row);grouped.set(key,members);}
 return [...grouped].filter(([,members])=>members.some(matches)).map(([id,members])=>{
  const ordered=[...members].sort((a,b)=>Number(b.capacity_selected)-Number(a.capacity_selected)||b.created_at.localeCompare(a.created_at)||a.id.localeCompare(b.id));
  return {id,primary:ordered[0],others:ordered.slice(1)};
 }).sort((a,b)=>compare(a.primary,b.primary)||a.id.localeCompare(b.id));
}
