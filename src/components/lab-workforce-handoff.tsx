'use client';
import {useEffect,useState} from 'react';
import {adaFetch} from '@/lib/ada-client';
import {useLabProjectActivity} from './lab-project-activity-provider';
import {summarizeWorkforceHandoff,type WorkforceCandidate,type WorkforceEvidence} from '@/lib/lab-workforce-handoff';

const format=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
const hours=(value:number)=>`${format.format(value)} hrs`;

export function LabWorkforceHandoff({projectId,workspaceId,candidates}:{
 projectId:string;workspaceId:string;candidates:WorkforceCandidate[];
}){
 const [evidence,setEvidence]=useState<WorkforceEvidence|null>(null);
 const [error,setError]=useState('');
 const activity=useLabProjectActivity();
 useEffect(()=>{
  let active=true;
  adaFetch(`/api/projects/${encodeURIComponent(projectId)}/workforce`).then(async response=>{
   const body=await response.json();
   if(!response.ok)throw Error(body.error||'Workforce evidence could not load.');
   if(active)setEvidence(body.evidence);
  }).catch(err=>{if(active)setError(err instanceof Error?err.message:'Workforce evidence could not load.');});
  return()=>{active=false;};
 },[projectId]);

 if(error)return <p role="alert">{error}</p>;
 if(!evidence)return null;
 if(evidence.workspace_id!==workspaceId)return <p role="status">Workforce links need review for this quote version.</p>;
 if(activity.error)return <p role="status">Workforce hours are unavailable until project activity loads.</p>;
 const capture=activity.data?.activity?.snapshot;
 if(!capture)return <p role="status">Loading Workforce hours…</p>;
 const summary=summarizeWorkforceHandoff(evidence,candidates,capture.labor);
 return <section aria-label="Workforce build item hours" className="space-y-3 rounded border p-4">
  <h2 className="font-semibold">Workforce build item hours</h2>
  <table className="w-full text-sm">
   <thead><tr><th scope="col" className="text-left">Build item</th><th scope="col" className="text-right">Budgeted</th><th scope="col" className="text-right">Recorded</th></tr></thead>
   <tbody>{summary.items.map(item=><tr className="border-t" key={item.quoteLineId}>
    <th scope="row" className="py-2 text-left font-medium">{item.name}</th><td className="text-right">{hours(item.hoursAllowed)}</td><td className="text-right">{hours(item.recorded)}</td>
   </tr>)}</tbody>
  </table>
  <dl className="space-y-1 text-sm">
   {(['group','service'] as const).map(kind=>{
    const groups=summary.groups.filter(group=>group.kind===kind);
    return groups.length>0&&<div key={kind}>
     <dt className="font-medium">{kind==='group'?'Grouped work':'Service activities'}</dt>
     <dd>{groups.map(group=>`${group.label} · ${hours(group.hours)}`).join(' · ')}</dd>
    </div>;
   })}
   <div className="flex justify-between"><dt>Unallocated</dt><dd>{hours(summary.unallocated)}</dd></div>
   <div className="flex justify-between border-t pt-2 font-semibold"><dt>Total recorded labor</dt><dd>{hours(summary.total)}</dd></div>
  </dl>
 </section>;
}
