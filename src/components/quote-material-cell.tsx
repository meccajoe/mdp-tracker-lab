'use client';
import {selectTextCell,editTextCell,isEditingText} from './quote-cell-editing';
import {useMemo,useRef,useState,type CSSProperties} from 'react';
import {moveToVerticalCell} from './quote-cell-navigation';
import type {Material} from '@/lib/quote-v27';
import styles from './quote-takeoffs.module.css';
export function QuoteMaterialCell({value,label,materials,usage,disabled,commit,hidePrice=false,onPick,clearWholeCell=false}:{value:string;label:string;materials:Material[];usage:Record<string,number>;disabled:boolean;commit:(value:string,selected:boolean)=>boolean;hidePrice?:boolean;clearWholeCell?:boolean;onPick?:(id:string)=>boolean}) {
  const [position,setPosition]=useState<CSSProperties>({});
  const input=useRef<HTMLInputElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[index,setIndex]=useState(-1);
  const choices=useMemo(()=>materials.filter(m=>m.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>(usage[b.name]??0)-(usage[a.name]??0)),[materials,query,usage]);
  function choose(material:Material){const name=material.name;if(onPick?onPick(material.id):commit(name,true)){if(input.current)input.current.value=name;setOpen(false);setIndex(-1);}}
  return <><input aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?`${label}-choices`:undefined} aria-activedescendant={open&&index>=0?`${label}-choice-${index}`:undefined} ref={input} defaultValue={value} disabled={disabled}
    onFocus={e=>{selectTextCell(e.currentTarget);const rect=e.currentTarget.getBoundingClientRect();const width=Math.min(480,window.innerWidth-24);setPosition({position:'fixed',left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),width,...(rect.bottom>window.innerHeight*.55?{bottom:window.innerHeight-rect.top,top:'auto'}:{top:rect.bottom,bottom:'auto'})});setOpen(false);setQuery('');setIndex(-1);}}
    onMouseUp={e=>{if(!isEditingText(e.currentTarget)){e.preventDefault();e.currentTarget.select();}}}
    onClick={e=>{if(e.detail===1)selectTextCell(e.currentTarget);}}
    onDoubleClick={e=>editTextCell(e.currentTarget)}
    onChange={e=>{editTextCell(e.currentTarget);setQuery(e.target.value);setIndex(-1);setOpen(Boolean(e.target.value.trim()));}}
    onBlur={e=>{setOpen(false);const text=e.currentTarget.value;if(text!==value&&!commit(text,false))e.currentTarget.value=value;}}
    onKeyDown={e=>{
      if(clearWholeCell&&!isEditingText(e.currentTarget)&&(e.key==='Delete'||e.key==='Backspace')&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();if(commit('',false)){e.currentTarget.value='';setQuery('');setOpen(false);setIndex(-1);}return;}
      if(e.key==='F2'){e.preventDefault();editTextCell(e.currentTarget);e.currentTarget.setSelectionRange(e.currentTarget.value.length,e.currentTarget.value.length);return;}
      if(open&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();e.stopPropagation();setIndex(i=>choices.length===0?-1:i<0?(e.key==='ArrowUp'?choices.length-1:0):(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length);}
      else if(open&&(e.key==='Enter'||e.key==='Tab')&&index>=0&&choices[index]){e.preventDefault();e.stopPropagation();const element=e.currentTarget;choose(choices[index]);if(e.key==='Tab')moveToVerticalCell(element,e.shiftKey?-1:1);}
      else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);if(input.current)input.current.value=value;}
      else if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}
    }}/>{open&&<div className={styles.materialList} style={position} role="listbox" id={`${label}-choices`} aria-label="Materials and labor choices">
      <div className={styles.listHint}>Type to search · ↑ ↓ then Enter to select · Escape to close</div>
      {choices.map((m,i)=><button type="button" role="option" aria-selected={index===i} id={`${label}-choice-${i}`} key={m.id} ref={element=>{if(element&&index===i)element.scrollIntoView({block:'nearest'});}} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(m)}><span>{m.name}</span><small>{m.unit}{!hidePrice&&` · $${m.unitCost.toFixed(2)}`}</small></button>)}
      {!choices.length&&<p>No match. Enter keeps your custom text.</p>}
    </div>}</>;
}
