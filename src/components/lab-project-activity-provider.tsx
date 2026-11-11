'use client';
import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {adaFetch} from '@/lib/ada-client';
import type {ActivityCapture,summarizeProjectActivity} from '@/lib/lab-project-activity';
export type ActivityPayload={activity:null|{captured_at:string;imported_at:string;source_sha256:string;snapshot:ActivityCapture};summary?:ReturnType<typeof summarizeProjectActivity>};
const ActivityContext=createContext<{data:ActivityPayload|null;error:string;retry:()=>void}|null>(null);
export function LabProjectActivityProvider({projectId,children}:{projectId:string;children:ReactNode}){
 const [data,setData]=useState<ActivityPayload|null>(null),[error,setError]=useState(''),[attempt,setAttempt]=useState(0);
 useEffect(()=>{let current=true;setData(null);setError('');
  adaFetch(`/api/projects/${encodeURIComponent(projectId)}/activity`).then(async response=>{const body=await response.json();if(!response.ok)throw Error(body.error||'Project activity could not load.');if(current)setData(body);}).catch(e=>{if(current)setError(e instanceof Error?e.message:'Project activity could not load.');});
  return()=>{current=false;};
 },[projectId,attempt]);
 return <ActivityContext.Provider value={{data,error,retry:()=>setAttempt(v=>v+1)}}>{children}</ActivityContext.Provider>;
}
export function useLabProjectActivity(){const state=useContext(ActivityContext);if(!state)throw Error('Project activity provider required.');return state;}
