'use client';
import {useMemo,useRef,useState,type CSSProperties} from 'react';
import type {Material} from '@/lib/quote-v27';
import styles from './quote-takeoffs.module.css';
export function QuoteMaterialCell({value,label,materials,usage,disabled,commit}:{value:string;label:string;materials:Material[];usage:Record<string,number>;disabled:boolean;commit:(value:string,selected:boolean)=>boolean}) {
  const [position,setPosition]=useState<CSSProperties>({});
  const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[index,setIndex]=useState(-1);
  const choices=useMemo(()=>materials.filter(m=>m.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(usage[b.name]??0)-(usage[a.name]??0)).slice(0,150),[materials,query,usage]);
  function choose(name:string){if(commit(name,true)){if(input.current)input.current.value=name;setOpen(false);setIndex(-1);}}
  return <><input aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?`${label}-choices`:undefined} aria-activedescendant={open&&index>=0?`${label}-choice-${index}`:undefined} ref={input} defaultValue={value} disabled={disabled}
    onFocus={e=>{const rect=e.currentTarget.getBoundingClientRect();const width=Math.min(480,window.innerWidth-24);setPosition({position:'fixed',left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),width,...(rect.bottom>window.innerHeight*.55?{bottom:window.innerHeight-rect.top,top:'auto'}:{top:rect.bottom,bottom:'auto'})});setOpen(true);setQuery('');setIndex(-1);}}
    onChange={e=>{setQuery(e.target.value);setIndex(-1);setOpen(true);}}
    onBlur={e=>{setOpen(false);const text=e.currentTarget.value;if(text!==value&&!commit(text,false))e.currentTarget.value=value;}}
    onKeyDown={e=>{
      if(open&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();e.stopPropagation();setIndex(i=>Math.max(0,Math.min(choices.length-1,i+(e.key==='ArrowDown'?1:-1))));}
      else if(open&&(e.key==='Enter'||e.key==='Tab')&&index>=0&&choices[index]){e.preventDefault();e.stopPropagation();choose(choices[index].name);}
      else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);if(input.current)input.current.value=value;}
      else if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}
    }}/>{open&&<div className={styles.materialList} style={position} role="listbox" id={`${label}-choices`} aria-label="Materials and labor choices">
      <div className={styles.listHint}>Type to search · ↑ ↓ then Enter to select · Escape to close</div>
      {choices.map((m,i)=><button type="button" role="option" aria-selected={index===i} id={`${label}-choice-${i}`} key={m.id} ref={element=>{if(element&&index===i)element.scrollIntoView({block:'nearest'});}} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(m.name)}><span>{m.name}</span><small>{m.unit} · ${m.unitCost.toFixed(2)}</small></button>)}
      {!choices.length&&<p>No match. Enter keeps your custom text.</p>}
    </div>}</>;
}
