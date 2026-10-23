'use client';
import {useLayoutEffect, useRef} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {toast} from 'sonner';
/** View-only widths; optional persistence is provided by RememberedColumns. */
export function QuoteColumnResize({label}:{label:string}){
 const drag=useRef<{x:number;width:number;column:HTMLTableColElement;table:HTMLTableElement;total:number}|null>(null);
 function prepare(button:HTMLElement){const th=button.closest('th'),table=th?.closest('table');if(!th||!table)return null;const cols=Array.from(table.querySelectorAll('col'));const cells=Array.from(th.parentElement!.children) as HTMLElement[];if(cols.length!==cells.length)return null;let total=0;cols.forEach((col,i)=>{const w=cells[i].getBoundingClientRect().width;col.style.width=`${w}px`;total+=w;});if(cols[1])table.style.setProperty('--quote-item-width',cols[1].style.width);table.style.tableLayout='fixed';table.style.width=`${total}px`;table.style.minWidth='0';return {column:cols[th.cellIndex],table,total,width:cells[th.cellIndex].getBoundingClientRect().width};}
 function resize(d:NonNullable<typeof drag.current>,delta:number){const width=Math.max(50,d.width+delta);d.column.style.width=`${width}px`;d.table.style.width=`${d.total+width-d.width}px`;const item=d.table.querySelectorAll('col')[1];if(item)d.table.style.setProperty('--quote-item-width',item.style.width);}
 return <button type="button" aria-label={`Resize ${label} column`} title="Drag to resize; arrow keys adjust width" style={{position:'absolute',right:0,top:0,bottom:0,width:8,padding:0,cursor:'col-resize',touchAction:'none',border:0,borderRight:'2px solid #94a3b855',background:'transparent'}} onClick={e=>e.stopPropagation()} onPointerDown={e=>{e.preventDefault();e.stopPropagation();const d=prepare(e.currentTarget);if(d){drag.current={...d,x:e.clientX};e.currentTarget.setPointerCapture(e.pointerId);}}} onPointerMove={e=>{if(drag.current)resize(drag.current,e.clientX-drag.current.x);}} onPointerUp={()=>{if(drag.current)drag.current.table.dispatchEvent(new Event('columnresize'));drag.current=null;}} onPointerCancel={()=>{if(drag.current)drag.current.table.dispatchEvent(new Event('columnresize'));drag.current=null;}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();const d=prepare(e.currentTarget);if(d){resize({...d,x:0},e.key==='ArrowRight'?16:-16);d.table.dispatchEvent(new Event('columnresize'));}}}}/>;
}

// Serialize account saves/loads across tab unmounts so an older request cannot win.
let preferencesQueue:Promise<unknown>=Promise.resolve();
function queued<T>(work:()=>Promise<T>):Promise<T>{
 const result=preferencesQueue.then(work,work);
 preferencesQueue=result.catch(()=>undefined);
 return result;
}
/** Account preferences, keyed by column identity so trade changes cannot shift widths. */
export function RememberedColumns({labels, storageKey, defaultWidths}:{labels:readonly string[];storageKey:string;defaultWidths?:readonly number[]}) {
 const ref=useRef<HTMLTableColElement>(null);
 const signature=JSON.stringify(labels);
 useLayoutEffect(()=>{
  const group=ref.current, table=group?.closest('table');
  if(!group||!table)return;
  const names:string[]=JSON.parse(signature);
  const cols=Array.from(group.children) as HTMLTableColElement[];
  const cells=Array.from(table.tHead?.rows[0]?.cells??[]);
  if(cols.length!==cells.length)return;
  let disposed=false,edited=false;
  let saved:Record<string,number>={};
  const legacyKey=`mdp:column-widths:v1:${storageKey}`;
  const clean=(value:unknown):Record<string,number>=>!value||typeof value!=='object'||Array.isArray(value)?{}:
   Object.fromEntries(Object.entries(value).filter(([,width])=>typeof width==='number'&&Number.isFinite(width)&&width>=40&&width<=10000));
  const apply=(values:Record<string,number>)=>{
   if(!names.some(name=>Object.hasOwn(values,name)))return;
   const widths=names.map((name,i)=>values[name]??Math.max(50,cells[i].getBoundingClientRect().width));
   cols.forEach((col,i)=>{col.style.width=`${widths[i]}px`;});
   table.style.tableLayout='fixed';table.style.width=`${widths.reduce((a,b)=>a+b,0)}px`;table.style.minWidth='0';
  };
  const persist=(widths:Record<string,number>)=>queued(async()=>{
   const response=await adaFetch('/api/capacity/column-widths',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({table:storageKey,widths}),keepalive:true});
   if(!response.ok)throw new Error('save');
  }).catch(()=>{toast.error('Column widths could not save to your account. Resize again to retry.');});
  void queued(async()=>{
   const response=await adaFetch(`/api/capacity/column-widths?table=${encodeURIComponent(storageKey)}`,{cache:'no-store'});
   if(!response.ok)throw new Error('load');
   return response.json();
  }).then(result=>{
   if(disposed||edited)return;
   saved=clean(result.widths);
   if(result.widths===null){
    try{saved=clean(JSON.parse(localStorage.getItem(legacyKey)??'{}'));}catch{/* Ignore invalid old preferences. */}
    if(Object.keys(saved).length)void persist(saved);
   }
   apply(saved);
  }).catch(()=>{if(!disposed)toast.error('Could not load your saved column widths.');});
  const save=()=>{
   edited=true;
   names.forEach((name,i)=>{saved[name]=cells[i].getBoundingClientRect().width;});
   void persist({...saved});
  };
  table.addEventListener('columnresize',save);
  return ()=>{disposed=true;table.removeEventListener('columnresize',save);};
 },[signature,storageKey]);
 return <colgroup ref={ref}>{labels.map((label,i)=><col key={label} style={defaultWidths?{width:defaultWidths[i]}:undefined}/>)}</colgroup>;
}
