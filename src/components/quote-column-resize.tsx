'use client';
import {useLayoutEffect, useRef} from 'react';
/** View-only widths; optional persistence is provided by RememberedColumns. */
export function QuoteColumnResize({label}:{label:string}){
 const drag=useRef<{x:number;width:number;column:HTMLTableColElement;table:HTMLTableElement;total:number}|null>(null);
 function prepare(button:HTMLElement){const th=button.closest('th'),table=th?.closest('table');if(!th||!table)return null;const cols=Array.from(table.querySelectorAll('col'));const cells=Array.from(th.parentElement!.children) as HTMLElement[];if(cols.length!==cells.length)return null;let total=0;cols.forEach((col,i)=>{const w=cells[i].getBoundingClientRect().width;col.style.width=`${w}px`;total+=w;});if(cols[1])table.style.setProperty('--quote-item-width',cols[1].style.width);table.style.tableLayout='fixed';table.style.width=`${total}px`;table.style.minWidth='0';return {column:cols[th.cellIndex],table,total,width:cells[th.cellIndex].getBoundingClientRect().width};}
 function resize(d:NonNullable<typeof drag.current>,delta:number){const width=Math.max(50,d.width+delta);d.column.style.width=`${width}px`;d.table.style.width=`${d.total+width-d.width}px`;const item=d.table.querySelectorAll('col')[1];if(item)d.table.style.setProperty('--quote-item-width',item.style.width);}
 return <button type="button" aria-label={`Resize ${label} column`} title="Drag to resize; arrow keys adjust width" style={{position:'absolute',right:0,top:0,bottom:0,width:8,padding:0,cursor:'col-resize',touchAction:'none',border:0,borderRight:'2px solid #94a3b855',background:'transparent'}} onClick={e=>e.stopPropagation()} onPointerDown={e=>{e.preventDefault();e.stopPropagation();const d=prepare(e.currentTarget);if(d){drag.current={...d,x:e.clientX};e.currentTarget.setPointerCapture(e.pointerId);}}} onPointerMove={e=>{if(drag.current)resize(drag.current,e.clientX-drag.current.x);}} onPointerUp={()=>{if(drag.current)drag.current.table.dispatchEvent(new Event('columnresize'));drag.current=null;}} onPointerCancel={()=>{if(drag.current)drag.current.table.dispatchEvent(new Event('columnresize'));drag.current=null;}} onKeyDown={e=>{if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();e.stopPropagation();const d=prepare(e.currentTarget);if(d){resize({...d,x:0},e.key==='ArrowRight'?16:-16);d.table.dispatchEvent(new Event('columnresize'));}}}}/>;
}

/** Browser-local preferences, keyed by column identity so trade changes cannot shift widths. */
export function RememberedColumns({labels, storageKey}:{labels:readonly string[];storageKey:string}) {
 const ref=useRef<HTMLTableColElement>(null);
 const signature=JSON.stringify(labels);
 useLayoutEffect(()=>{
  const group=ref.current, table=group?.closest('table');
  if(!group||!table)return;
  const names:string[]=JSON.parse(signature);
  const cols=Array.from(group.children) as HTMLTableColElement[];
  const cells=Array.from(table.tHead?.rows[0]?.cells??[]);
  if(cols.length!==cells.length)return;
  const key=`mdp:column-widths:v1:${storageKey}`;
  const read=():Record<string,number>=>{
   try {
    const value:unknown=JSON.parse(localStorage.getItem(key)??'{}');
    if(!value||typeof value!=='object'||Array.isArray(value))return {};
    return Object.fromEntries(Object.entries(value).filter(([,width])=>typeof width==='number'&&Number.isFinite(width)&&width>=50&&width<=10000));
   } catch {return {};}
  };
  const saved=read();
  if(names.some(name=>Object.hasOwn(saved,name))){
   const widths=names.map((name,i)=>saved[name]??Math.max(50,cells[i].getBoundingClientRect().width));
   cols.forEach((col,i)=>{col.style.width=`${widths[i]}px`;});
   table.style.tableLayout='fixed';
   table.style.width=`${widths.reduce((a,b)=>a+b,0)}px`;
   table.style.minWidth='0';
  }
  const save=()=>{
   const widths={...read()};
   names.forEach((name,i)=>{widths[name]=cells[i].getBoundingClientRect().width;});
   try {localStorage.setItem(key,JSON.stringify(widths));} catch {/* Resizing still works when storage is unavailable. */}
  };
  table.addEventListener('columnresize',save);
  return ()=>table.removeEventListener('columnresize',save);
 },[signature,storageKey]);
 return <colgroup ref={ref}>{labels.map(label=><col key={label}/>)}</colgroup>;
}
