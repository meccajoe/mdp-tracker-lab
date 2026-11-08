'use client';
import {useLayoutEffect,useRef} from 'react';

/** Measured offsets keep frozen cells aligned while spreadsheet columns resize. */
export function useStickyTableColumns(count:number,layoutKey:string|boolean=''){
 const ref=useRef<HTMLTableElement>(null);
 useLayoutEffect(()=>{
  const table=ref.current;
  if(!table)return;
  const cells=Array.from(table.tHead?.rows[0]?.cells??[]).slice(0,count);
  const update=()=>{
   const widths=cells.map(cell=>cell.getBoundingClientRect().width);
   let left=0;
   widths.forEach((width,index)=>{
    table.style.setProperty(`--column-offset-${index+1}`,`${left}px`);
    left+=width;
   });
  };
  const observer=new ResizeObserver(update);
  cells.forEach(cell=>observer.observe(cell));
  update();
  return()=>observer.disconnect();
 },[count,layoutKey]);
 return ref;
}
