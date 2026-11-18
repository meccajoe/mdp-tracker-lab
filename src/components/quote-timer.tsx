'use client';
import {QuoteTimeCorrection} from './quote-time-correction';
import {useEffect,useRef,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {supabase} from '@/lib/supabase';
import {parseQuoteTimeSpans,quoteTimeLabel,spanMilliseconds,type QuoteTimeSpan} from '@/lib/quote-time';
const IDLE_LIMIT_MS=10*60*1000;
export function QuoteTimer({workspaceId}:{workspaceId:string}){
 const [display,setDisplay]=useState({ms:0,state:'Loading time…',error:'',canToggle:false,paused:false,savingPause:false});
 const togglePause=useRef<()=>void>(()=>{});
 useEffect(()=>{
  let disposed=false,canTrack=false,manualPaused=false,total=0,queue:QuoteTimeSpan[]=[],key='',actorId='',syncError='',segmentStart=0,segmentEnd=0,last=Date.now(),sending=false,flushAgain=false;
  let lastActivity=Date.now(),idlePaused=false,resumeOnActivity=false;
  const sessionId=crypto.randomUUID();
  let pauseVersion=0,pendingPause:{paused:boolean;version:number}|null=null,initialSync=true;
  let interval:ReturnType<typeof setInterval>|undefined;
  const persist=()=>{if(key)try{sessionStorage.setItem(key,JSON.stringify(queue));}catch{/* Keep the in-memory queue and visible pending indicator. */}};
  const closeSegment=()=>{if(segmentEnd>segmentStart){queue.push({id:crypto.randomUUID(),start:new Date(segmentStart).toISOString(),end:new Date(segmentEnd).toISOString()});segmentStart=segmentEnd=0;persist();}};
  const draw=()=>{if(!disposed)setDisplay({ms:total+spanMilliseconds(queue)+(segmentEnd-segmentStart),state:canTrack?(manualPaused?(idlePaused?'Paused · Inactive':'Paused · Break'):'Timing'):'Paused · Final or read-only',error:syncError,canToggle:canTrack&&!pendingPause,paused:manualPaused,savingPause:Boolean(pendingPause)});};
  const tick=()=>{
   const now=Date.now(),cutoff=lastActivity+IDLE_LIMIT_MS,end=Math.min(now,cutoff);
   if(canTrack&&!manualPaused&&now>last){
    let start=last;
    while(start<end){
     if(!segmentStart)segmentStart=start;
     segmentEnd=Math.min(end,segmentStart+60000);
     start=segmentEnd;
     if(segmentEnd-segmentStart>=60000)closeSegment();
    }
   }
   if(canTrack&&!manualPaused&&now>=cutoff){pendingPause={paused:true,version:pauseVersion};manualPaused=true;idlePaused=true;}
   last=now;
   draw();
  };
  async function sync(final=false){
   closeSegment();if(!key)return;if(sending){flushAgain=true;return;}sending=true;flushAgain=false;
   const batch=queue.slice(0,100),change=pendingPause;
   try{
    const response=await adaFetch(`/api/quote-workspaces/${workspaceId}/time`,{method:'POST',headers:{'Content-Type':'application/json','X-Quote-Time-Actor':actorId},body:JSON.stringify({spans:batch,sessionId,sessionOpen:!disposed&&pageOpen,...(change?{paused:change.paused,pauseVersion:change.version}:{})}),keepalive:final});
    const data=await response.json();if(!response.ok){if([401,403,409].includes(response.status))canTrack=false;if(response.status===409){pendingPause=null;initialSync=false;}throw Error(data.error||'Time could not sync.');}
    if(data.actorId!==actorId){canTrack=false;throw Error('Account changed');}
    tick();const wasPaused=manualPaused;const previousVersion=pauseVersion;if(change===pendingPause)pendingPause=null;pauseVersion=data.pauseVersion;manualPaused=pendingPause?true:Boolean(data.paused);
    if(data.pauseVersion!==previousVersion&&!change){idlePaused=false;resumeOnActivity=false;}
    if(wasPaused&&!manualPaused){lastActivity=Date.now();idlePaused=false;}
    if(initialSync){initialSync=false;try{if(manualPaused&&sessionStorage.getItem(`${key}:idleVersion`)===String(pauseVersion))idlePaused=true;if(pauseVersion===0&&sessionStorage.getItem(`${key}:paused`)==='true'){pendingPause={paused:true,version:pauseVersion};manualPaused=true;flushAgain=true;}sessionStorage.removeItem(`${key}:paused`);}catch{/* Account state remains authoritative. */}}
    try{if(idlePaused&&manualPaused&&!pendingPause)sessionStorage.setItem(`${key}:idleVersion`,String(pauseVersion));else if(!idlePaused)sessionStorage.removeItem(`${key}:idleVersion`);}catch{}
    syncError='';total=Number(data.totalMs)||0;canTrack=!disposed&&pageOpen&&Boolean(data.canTrack)&&data.quoteStatus==='draft';last=Date.now();
    if(resumeOnActivity&&idlePaused&&manualPaused&&!pendingPause&&canTrack){pendingPause={paused:false,version:pauseVersion};idlePaused=false;resumeOnActivity=false;flushAgain=true;}
    const sent=new Set(batch.map(span=>span.id));queue=queue.filter(span=>!sent.has(span.id));if(queue.length||pendingPause)flushAgain=true;persist();draw();
   }catch{syncError='Time not synced · retrying';draw();}finally{sending=false;if(flushAgain&&!syncError)void sync(disposed||final);}
  }
  // Pause immediately; Resume only after the account-backed change succeeds.
  togglePause.current=()=>{
   if(disposed||!canTrack||pendingPause)return;
   tick();if(pendingPause){void sync(true);return;}pendingPause={paused:!manualPaused,version:pauseVersion};manualPaused=true;idlePaused=false;resumeOnActivity=false;lastActivity=Date.now();last=Date.now();
   draw();void sync(true);
  };
  let pageOpen=true;
  const stop=()=>{tick();pageOpen=false;canTrack=false;closeSegment();void sync(true);};
  const focus=()=>{tick();void sync();};
  const restore=()=>{pageOpen=true;last=Date.now();void sync();};
  const visibility=()=>{tick();void sync(true);};
  const saved=()=>{tick();void sync();};
  // Check expiry before recording activity: waking a sleeping tab must not count the gap.
  // Only this session's inactivity pause can auto-resume. Manual/account pauses stay authoritative.
  const activity=(event:Event)=>{
   if(!canTrack||(event.target as Element|null)?.closest?.('[data-quote-timer-controls]'))return;
   const now=Date.now();if(!manualPaused&&now>=lastActivity+IDLE_LIMIT_MS)tick();
   if(manualPaused){
    if(!idlePaused||event.type==='pointermove')return;
    lastActivity=now;resumeOnActivity=true;
    if(!pendingPause&&!sending){pendingPause={paused:false,version:pauseVersion};idlePaused=false;resumeOnActivity=false;}
    void sync();return;
   }
   lastActivity=now;
  };
  const corrected=()=>{idlePaused=false;resumeOnActivity=false;try{sessionStorage.removeItem(`${key}:idleVersion`);}catch{}};
  const activityEvents=['pointerdown','pointermove','keydown','scroll','touchstart'] as const;
  void (async()=>{
   const {data}=await supabase.auth.getSession();if(disposed)return;if(!data.session){syncError='Sign in to track time';draw();return;}
   actorId=data.session.user.id;key=`mdp:quote-time:${actorId}:${workspaceId}`;
   try{const saved=JSON.parse(sessionStorage.getItem(key)||'[]');if(Array.isArray(saved))queue=saved.flatMap(span=>{try{return parseQuoteTimeSpans([span]);}catch{return [];}});}catch{}
   await sync();if(disposed)return;last=Date.now();let ticks=0;
   interval=setInterval(()=>{tick();if(++ticks%15===0||pendingPause)void sync();},1000);
   for(const name of activityEvents)window.addEventListener(name,activity,{capture:true,passive:true});
   window.addEventListener('focus',focus);window.addEventListener('pagehide',stop);window.addEventListener('pageshow',restore);document.addEventListener('visibilitychange',visibility);window.addEventListener('quote-workbook-saved',saved);window.addEventListener('quote-time-corrected',corrected);
  })();
  return()=>{togglePause.current=()=>{};tick();disposed=true;canTrack=false;clearInterval(interval);for(const name of activityEvents)window.removeEventListener(name,activity,true);window.removeEventListener('focus',focus);window.removeEventListener('pagehide',stop);window.removeEventListener('pageshow',restore);document.removeEventListener('visibilitychange',visibility);window.removeEventListener('quote-workbook-saved',saved);window.removeEventListener('quote-time-corrected',corrected);void sync(true);};
 },[workspaceId]);
 return <div data-quote-timer-controls className="rounded-md border border-border bg-muted/40 px-2 py-0.5 text-xs" aria-label="Quote time spent" title="Combined quoting time across the team. Automatically pauses after 10 minutes without mouse, keyboard, touch or scrolling activity in this quote. Typing, clicking or scrolling resumes an inactivity pause. Manual pauses require Resume. Background tabs count only until the inactivity limit. Pauses when you leave or mark the quote Final. Pause is saved to your account for this quote across computers; Resume continues from the saved total. Saves every 15 seconds. Time starts from this feature’s release."><span className="text-muted-foreground">Time spent </span><strong className="tabular-nums text-sm">{quoteTimeLabel(display.ms)}</strong><span className="ml-2 text-muted-foreground">{display.error||display.state}</span><button type="button" className="ml-2 rounded border border-border bg-background px-2 py-0.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50" disabled={!display.canToggle} onClick={()=>togglePause.current()} aria-label={display.paused?'Resume quote timer':'Pause quote timer'} title="Pause or resume your time for this quote on all computers. Other team members’ timers are unaffected.">{display.savingPause?'Saving…':display.paused?'Resume':'Pause'}</button><QuoteTimeCorrection workspaceId={workspaceId}/></div>;
}
