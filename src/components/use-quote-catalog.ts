'use client';
import {useCallback,useEffect,useRef,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import type {Material} from '@/lib/quote-v27';
export function useQuoteCatalog() {
  const [materials,setMaterials]=useState<Material[]|null>(null);
  const [status,setStatus]=useState('Connecting to Tracker catalog…');
  const [initialized,setInitialized]=useState(false);
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
      if(!Array.isArray(data.materials))throw new Error('Invalid Tracker catalog.');
      if(mounted.current){setMaterials(data.materials);setInitialized(Boolean(data.initialized));setWarnings(data.warnings??[]);setStatus(data.initialized?`Tracker catalog · ${data.materials.length} entries · checked ${new Date(data.fetchedAt).toLocaleTimeString()}`:`Google Sheet DB · Tracker copy pending. ${data.setupMessage??''}`);}
    } catch(error) {
      if(mounted.current){setMaterials(null);setInitialized(false);setStatus(`${error instanceof Error?error.message:'Tracker catalog unavailable.'} Showing quote snapshots; saved prices unchanged.`);}
    } finally {fetching.current=false;}
  },[]);
  useEffect(()=>{
    mounted.current=true;void refresh();
    const visibleRefresh=()=>{if(document.visibilityState==='visible')void refresh();};
    const interval=setInterval(visibleRefresh,15000);
    window.addEventListener('focus',visibleRefresh);window.addEventListener('tracker-catalog-changed',visibleRefresh);
    return()=>{mounted.current=false;clearInterval(interval);window.removeEventListener('focus',visibleRefresh);window.removeEventListener('tracker-catalog-changed',visibleRefresh);};
  },[refresh]);
  return {materials,status,warnings,refresh,initialized};
}
