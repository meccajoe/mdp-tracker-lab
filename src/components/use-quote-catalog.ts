'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import type {Material} from '@/lib/quote-v27';
export function useQuoteCatalog() {
  const [materials,setMaterials]=useState<Material[]|null>(null);
  const [status,setStatus]=useState('Connecting to live Materials DB…');
  const [warnings,setWarnings]=useState<string[]>([]);
  const fetching=useRef(false);
  const mounted=useRef(false);
  const refresh=useCallback(async()=>{
    if(fetching.current)return;
    fetching.current=true;
    try {
      const response=await adaFetch('/api/quotes/catalog',{cache:'no-store'});
      const data=await response.json();
      if(!response.ok)throw new Error(data.error);
      if(!Array.isArray(data.materials)||!data.materials.length)throw new Error('Materials DB returned no entries.');
      if(mounted.current){setMaterials(data.materials);setWarnings(data.warnings??[]);setStatus(`Live Materials DB · ${data.materials.length} entries · checked ${new Date(data.fetchedAt).toLocaleTimeString()}`);}
    } catch {
      if(mounted.current)setStatus('Live Materials DB unavailable · showing last available catalog. Saved prices unchanged.');
    } finally {fetching.current=false;}
  },[]);
  useEffect(()=>{
    mounted.current=true;void refresh();
    const visibleRefresh=()=>{if(document.visibilityState==='visible')void refresh();};
    const interval=setInterval(visibleRefresh,15000);
    window.addEventListener('focus',visibleRefresh);
    return()=>{mounted.current=false;clearInterval(interval);window.removeEventListener('focus',visibleRefresh);};
  },[refresh]);
  return {materials,status,warnings,refresh};
}
