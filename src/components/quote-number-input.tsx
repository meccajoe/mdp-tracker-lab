'use client';
import {useEffect,useRef,useState,type InputHTMLAttributes,type ChangeEvent} from 'react';
import {quoteInputNumber} from '@/lib/quote-format';
/** Format at rest, allow natural typing, and never rewrite an untouched precise snapshot. */
export function QuoteNumberInput({value,defaultValue,onChange,onBlur,onFocus,onKeyDown,...props}:InputHTMLAttributes<HTMLInputElement>){
 const source=value??defaultValue??'';
 const shown=quoteInputNumber(source);
 const [draft,setDraft]=useState(shown);
 const focused=useRef(false),initial=useRef(shown);
 useEffect(()=>{if(!focused.current){setDraft(shown);initial.current=shown;}},[shown]);
 return <input {...props} type="number" value={draft} onFocus={e=>{focused.current=true;initial.current=e.currentTarget.value;onFocus?.(e);}} onChange={e=>setDraft(e.currentTarget.value)} onKeyDown={e=>{if(e.key==='Escape'){e.preventDefault();e.currentTarget.value=initial.current;setDraft(initial.current);e.currentTarget.blur();return;}onKeyDown?.(e);if(!e.defaultPrevented&&e.key==='Enter')e.currentTarget.blur();}} onBlur={e=>{
  focused.current=false;const typed=e.currentTarget.value,formatted=quoteInputNumber(typed);setDraft(formatted);e.currentTarget.value=formatted;
  if(typed===initial.current)return;
  onChange?.(e as unknown as ChangeEvent<HTMLInputElement>);onBlur?.(e);initial.current=formatted;
 }}/>;
}
