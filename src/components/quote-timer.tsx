'use client';
import {useEffect,useRef,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {supabase} from '@/lib/supabase';
import {parseQuoteTimeSpans,quoteTimeLabel,spanMilliseconds,type QuoteTimeSpan} from '@/lib/quote-time';
export function QuoteTimer({workspaceId}:{workspaceId:string}){
 const [display,setDisplay]=useState({ms:0,state:'Loading time…',error:'',canToggle:false,paused:false});
 const togglePause=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let disposed=false,canTrack=false,manualPaused=false,total=0,queue:QuoteTimeSpan[]=[],key='',actorId='',syncError='',segmentStart=0,segmentEnd=0,last=Date.now(),sending=false,flushAgain=false;
  let interval:ReturnType<typeof setInterval>|undefined;
  const persist=()=>{if(key)try{sessionStorage.setItem(key,JSON.stringify(queue));}catch{/* Keep the in-memory queue and visible pending indicator. */}};
  const closeSegment=()=>{if(segmentEnd>segmentStart){queue.push({id:crypto.randomUUID(),start:new Date(segmentStart).toISOString(),end:new Date(segmentEnd).toISOString()});segmentStart=segmentEnd=0;persist();}};
  const draw=()=>{if(!disposed)setDisplay({ms:total+spanMilliseconds(queue)+(segmentEnd-segmentStart),state:canTrack?(manualPaused?'Paused · Break':'Timing'):'Paused · Final or read-only',error:syncError,canToggle:canTrack,paused:manualPaused});};
  const tick=()=>{
   const now=Date.now();
   if(canTrack&&!manualPaused&&now>last){
    let start=last;
    while(start<now){
     if(!segmentStart)segmentStart=start;
     segmentEnd=Math.min(now,segmentStart+60000);
     start=segmentEnd;
     if(segmentEnd-segmentStart>=60000)closeSegment();
    }
   }
   last=now;
   draw();
  };
  async function sync(final=false){
   closeSegment();if(!key)return;if(sending){flushAgain=true;return;}sending=true;flushAgain=false;
   const batch=queue.slice(0,100);
   try{
    const response=await adaFetch(`/api/quote-workspaces/${workspaceId}/time`,batch.length?{method:'POST',headers:{'Content-Type':'application/json','X-Quote-Time-Actor':actorId},body:JSON.stringify(batch),keepalive:final}:{cache:'no-store'});
    const data=await response.json();if(!response.ok){if([401,403,409].includes(response.status))canTrack=false;throw Error(data.error||'Time could not sync.');}
    if(data.actorId!==actorId){canTrack=false;throw Error('Account changed');}
    tick();syncError='';total=Number(data.totalMs)||0;canTrack=!disposed&&pageOpen&&Boolean(data.canTrack)&&data.quoteStatus==='draft';last=Date.now();
    const sent=new Set(batch.map(span=>span.id));queue=queue.filter(span=>!sent.has(span.id));if(queue.length)flushAgain=true;persist();draw();
   }catch{syncError='Time not synced · retrying';draw();}finally{sending=false;if(flushAgain&&!syncError)void sync(disposed||final);}
  }
  // A manual break belongs to this user's quote tab and survives a reload.
  togglePause.current=()=>{
   if(disposed||!canTrack)return;
   tick();manualPaused=!manualPaused;last=Date.now();
   try{sessionStorage.setItem(`${key}:paused`,String(manualPaused));}catch{/* Keep the break active in memory. */}
   draw();void sync(true);
  };
  let pageOpen=true;
  const stop=()=>{tick();pageOpen=false;canTrack=false;closeSegment();void sync(true);};
  const focus=()=>{tick();void sync();};
  const restore=()=>{pageOpen=true;last=Date.now();void sync();};
  const visibility=()=>{tick();void sync(true);};
  const saved=()=>{tick();void sync();};
  void (async()=>{
   const {data}=await supabase.auth.getSession();if(disposed)return;if(!data.session){syncError='Sign in to track time';draw();return;}
   actorId=data.session.user.id;key=`mdp:quote-time:${actorId}:${workspaceId}`;
   try{manualPaused=sessionStorage.getItem(`${key}:paused`)==='true';}catch{/* Default to timing when storage is unavailable. */}
   try{const saved=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(saved))queue=saved.flatMap(span=>{try{return parseQuoteTimeSpans([span]);}catch{return [];}});}catch{}
   await sync();if(disposed)return;last=Date.now();let ticks=0;
   interval=setInterval(()=>{tick();if(++ticks%15===0)void sync();},1000);
   window.addEventListener('focus',focus);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',restore);document.addEventListener('visibilitychange',visibility);window.addEventListener('quote-workbook-saved',saved);
  })();
  return()=>{togglePause.current=()=>{};tick();disposed=true;canTrack=false;clearInterval(interval);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',restore);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('quote-workbook-saved',saved);void sync(true);};
 },[workspaceId]);
 return <div className="rounded-md border border-border bg-muted/40 px-3 py-1 text-xs" aria-label="Quote time spent" title="Combined quoting time across the team. Runs while this quote page is open, including other tabs/apps. Pauses when you leave or mark the quote Final. Use Pause for a break in this tab; Resume continues from the saved total. Saves every 15 seconds. Time starts from this feature’s release."><span className="text-muted-foreground">Time spent </span><strong className="tabular-nums text-sm">{quoteTimeLabel(display.ms)}</strong><span className="ml-2 text-muted-foreground">{display.error||display.state}</span><button type="button" className="ml-3 rounded border border-border bg-background px-2 py-1 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={!display.canToggle} onClick={()=>togglePause.current()} aria-label={display.paused?'Resume quote timer':'Pause quote timer'} title="Pause or resume your time in this tab. Other team members’ timers are unaffected.">{display.paused?'Resume':'Pause'}</button></div>;
}
