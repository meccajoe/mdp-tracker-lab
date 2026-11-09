'use client';

import {useEffect,useId,useRef,useState} from 'react';
import {createPortal} from 'react-dom';

/** Editable roster combobox: selecting a suggestion is optional. */
export function InstallerNameInput({label,value,options,disabled,onChange}:{
 label:string;value:string;options:string[];disabled:boolean;onChange:(value:string)=>void;
}) {
 const id=useId(),input=useRef<HTMLInputElement>(null),list=useRef<HTMLDivElement>(null);
 const [open,setOpen]=useState(false),[active,setActive]=useState(-1);
 const [position,setPosition]=useState({left:0,top:0,width:280,maxHeight:240});
 const matches=options.filter(name=>name.toLocaleLowerCase().includes(value.trim().toLocaleLowerCase()));
 const visible=open&&!disabled;
 function locate(){
  const rect=input.current?.getBoundingClientRect();if(!rect)return;
  const width=Math.min(Math.max(rect.width,280),window.innerWidth-16);
  const below=window.innerHeight-rect.bottom-8,above=rect.top-8;
  const height=Math.min(240,Math.max(below,above));
  setPosition({left:Math.max(8,Math.min(rect.left,window.innerWidth-width-8)),top:below>=Math.min(240,above)?rect.bottom+4:Math.max(8,rect.top-height-4),width,maxHeight:height});
 }
 function show(){locate();setOpen(true);setActive(-1);}
 function choose(name:string){onChange(name);setOpen(false);setActive(-1);}
 useEffect(()=>{
  if(!visible)return;
  window.addEventListener('resize',locate);window.addEventListener('scroll',locate,true);
  return()=>{window.removeEventListener('resize',locate);window.removeEventListener('scroll',locate,true);};
 },[visible]);
 useEffect(()=>{if(visible&&active>=0)list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({block:'nearest'});},[active,visible]);
 return <>
  <input ref={input} role="combobox" aria-label={label} aria-autocomplete="list" aria-expanded={visible} aria-controls={visible?id:undefined} aria-activedescendant={visible&&active>=0&&matches[active]?`${id}-${active}`:undefined}
   autoComplete="off" maxLength={120} placeholder="Search roster or type a name" disabled={disabled} value={value}
   onFocus={show} onClick={()=>{if(!visible)show();}} onBlur={()=>{setOpen(false);setActive(-1);}}
   onChange={e=>{onChange(e.target.value);show();}}
   onKeyDown={e=>{
    if(e.nativeEvent.isComposing)return;
    if(e.key==='ArrowDown'||e.key==='ArrowUp'){
     e.preventDefault();locate();setOpen(true);
     setActive(previous=>{if(!matches.length)return -1;const index=visible?previous:-1;return e.key==='ArrowDown'?(index+1)%matches.length:index<=0?matches.length-1:index-1;});
    }else if(e.key==='Enter'){
     e.preventDefault();if(visible&&active>=0&&matches[active])choose(matches[active]);else{setOpen(false);setActive(-1);}
    }else if(e.key==='Escape'){e.preventDefault();setOpen(false);setActive(-1);}
    else if(e.key==='Tab'){setOpen(false);setActive(-1);}
   }} className="rounded border px-2 py-1"/>
  {visible&&createPortal(<div style={{position:'fixed',...position,zIndex:100}} className="rounded-md border bg-background shadow-lg overflow-y-auto" ref={list}>
   <div role="listbox" id={id} aria-label={`${label} roster matches`}>
    {matches.map((name,index)=><div key={name} id={`${id}-${index}`} role="option" aria-selected={active===index} data-index={index}
     onMouseDown={e=>e.preventDefault()} onClick={()=>choose(name)} onMouseMove={()=>setActive(index)}
     className={`cursor-pointer px-3 py-2 text-sm ${active===index?'bg-accent text-accent-foreground':'hover:bg-muted'}`}>{name}</div>)}
   </div>
   <p className="border-t px-3 py-2 text-xs text-muted-foreground" role="status">{matches.length?'↑ ↓ to select · Enter to confirm. You can also keep a typed name.':'No roster match. Your typed name will be kept.'}</p>
  </div>,document.body)}
 </>;
}
