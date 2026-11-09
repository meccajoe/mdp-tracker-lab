'use client';
import {selectTextCell,editTextCell,isEditingText} from './quote-cell-editing';
import {useEffect,useId,useMemo,useRef,useState,type CSSProperties} from 'react';
import {createPortal} from 'react-dom';
import {moveToVerticalCell} from './quote-cell-navigation';
import {compareCatalogChoices} from '@/lib/catalog-sort';
import type {Material} from '@/lib/quote-v27';
import styles from './quote-takeoffs.module.css';
export function QuoteMaterialCell({value,label,materials,usage,disabled,commit,hidePrice=false,onPick,clearWholeCell=false}:{value:string;label:string;materials:Material[];usage:Record<string,number>;disabled:boolean;commit:(value:string,selected:boolean)=>boolean;hidePrice?:boolean;clearWholeCell?:boolean;onPick?:(id:string)=>boolean}) {
  const listId=useId(),saved=useRef(value);
  useEffect(()=>{saved.current=value;},[value]);
  const [position,setPosition]=useState<CSSProperties>({});
  const input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);
  const [open,setOpen]=useState(false),[query,setQuery]=useState(''),[index,setIndex]=useState(-1);
  useEffect(()=>{if(!open)return;const close=(event:PointerEvent)=>{const target=event.target as Node;if(!input.current?.contains(target)&&!list.current?.contains(target)){setOpen(false);input.current?.blur();}};document.addEventListener('pointerdown',close,true);return()=>document.removeEventListener('pointerdown',close,true);},[open]);
  const choices=useMemo(()=>materials.filter(m=>m.name.toLowerCase().includes(query.toLowerCase())).sort((a,b)=>compareCatalogChoices(a,b,usage)),[materials,query,usage]);
  function locate(){const rect=input.current?.getBoundingClientRect();if(!rect)return;const width=Math.min(480,window.innerWidth-24);setPosition({position:'fixed',zIndex:100,left:Math.max(12,Math.min(rect.left,window.innerWidth-width-12)),width,...(rect.bottom>window.innerHeight*.55?{bottom:window.innerHeight-rect.top,top:'auto'}:{top:rect.bottom,bottom:'auto'})});}
  useEffect(()=>{if(!open)return;locate();window.addEventListener('resize',locate);window.addEventListener('scroll',locate,true);return()=>{window.removeEventListener('resize',locate);window.removeEventListener('scroll',locate,true);};},[open]);
  useEffect(()=>{if(open&&index>=0)list.current?.querySelector(`[data-index="${index}"]`)?.scrollIntoView({block:'nearest'});},[open,index]);
  function choose(material:Material){const name=material.name;if(!(onPick?onPick(material.id):commit(name,true)))return false;saved.current=name;if(input.current)input.current.value=name;setOpen(false);setIndex(-1);return true;}
  function keepText(element:HTMLInputElement){const text=element.value;if(text===saved.current)return true;if(!commit(text,false)){element.value=saved.current;return false;}saved.current=text;return true;}
  return <><input aria-label={label} role="combobox" aria-autocomplete="list" aria-expanded={open} aria-controls={open?listId:undefined} aria-activedescendant={open&&index>=0?`${listId}-${index}`:undefined} ref={input} defaultValue={value} disabled={disabled}
    onFocus={e=>{selectTextCell(e.currentTarget);locate();setOpen(false);setQuery(e.currentTarget.value);setIndex(-1);}}
    onMouseDown={e=>{if(e.detail>=2)editTextCell(e.currentTarget);}}
    onMouseUp={e=>{if(e.detail<2&&!isEditingText(e.currentTarget)){e.preventDefault();e.currentTarget.select();}}}
    onClick={e=>{if(e.detail===1&&!isEditingText(e.currentTarget))selectTextCell(e.currentTarget);}}
    onDoubleClick={e=>{editTextCell(e.currentTarget);const cursor=e.currentTarget.selectionEnd??e.currentTarget.value.length;e.currentTarget.setSelectionRange(cursor,cursor);}}
    onChange={e=>{editTextCell(e.currentTarget);setQuery(e.target.value);setIndex(-1);setOpen(Boolean(e.target.value.trim()));}}
    onBlur={e=>{setOpen(false);setIndex(-1);keepText(e.currentTarget);}}
    onKeyDown={e=>{
      if(e.nativeEvent.isComposing)return;
      if(clearWholeCell&&!isEditingText(e.currentTarget)&&(e.key==='Delete'||e.key==='Backspace')&&!e.metaKey&&!e.ctrlKey&&!e.altKey&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();e.stopPropagation();if(commit('',false)){saved.current='';e.currentTarget.value='';setQuery('');setOpen(false);setIndex(-1);}return;}
      if(e.key==='F2'){e.preventDefault();editTextCell(e.currentTarget);e.currentTarget.setSelectionRange(e.currentTarget.value.length,e.currentTarget.value.length);return;}
      if((open||isEditingText(e.currentTarget)&&e.currentTarget.value.trim())&&(e.key==='ArrowDown'||e.key==='ArrowUp')){e.preventDefault();e.stopPropagation();setQuery(e.currentTarget.value);setOpen(true);setIndex(previous=>{const i=open?previous:-1;return choices.length===0?-1:i<0?(e.key==='ArrowUp'?choices.length-1:0):(i+(e.key==='ArrowDown'?1:-1)+choices.length)%choices.length;});}
      else if(open&&(e.key==='Enter'||e.key==='Tab')&&index>=0&&choices[index]){e.preventDefault();e.stopPropagation();const element=e.currentTarget;const chosen=choose(choices[index]);if(chosen&&e.key==='Tab')moveToVerticalCell(element,e.shiftKey?-1:1);}
      else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();setOpen(false);setIndex(-1);if(input.current)input.current.value=saved.current;}
      else if(e.key==='Enter'){e.preventDefault();e.stopPropagation();if(keepText(e.currentTarget)){setOpen(false);setIndex(-1);e.currentTarget.blur();}}
    }}/>{open&&!disabled&&createPortal(<div ref={list} className={styles.materialList} style={position} role="listbox" id={listId} aria-label="Materials and labor choices">
      <div className={styles.listHint}>↑ ↓ to select · Enter to confirm · Or keep a custom item</div>
      {choices.map((m,i)=><button type="button" role="option" aria-selected={index===i} id={`${listId}-${i}`} key={m.id} data-index={i} onMouseMove={()=>setIndex(i)} onMouseDown={e=>e.preventDefault()} onClick={()=>choose(m)}><span>{m.name}</span><small>{m.unit}{!hidePrice&&` · $${m.unitCost.toFixed(2)}`}</small></button>)}
      {!choices.length&&<p>No match. Enter keeps your custom text.</p>}
    </div>,document.body)}</>;
}
