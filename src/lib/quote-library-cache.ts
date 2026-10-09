import type {QuoteV27} from './quote-v27';

export type QuoteManifestEntry={id:string;title:string;revision:number;canEdit:boolean;lifecycle:string};
export type LibraryQuote={workspace:string;workspaceId:string;version:number;canEdit:boolean;document:QuoteV27|null};
type Fetcher=(url:string)=>Promise<Response>;

// Browser memory only. Permission/lifecycle metadata is refreshed independently
// of immutable revisions; no persistent storage or cross-actor shared cache.
export function createQuoteLibraryCache(fetcher:Fetcher,parse:(value:unknown)=>QuoteV27,now=Date.now){
  let identity:string|null=null,epoch=0,invalidation=0,flightInvalidation=0;
  let snapshot:{rows:QuoteManifestEntry[];at:number}|null=null;
  let manifestFlight:Promise<QuoteManifestEntry[]>|null=null;
  const documents=new Map<string,{version:number;document:QuoteV27}>();
  const flights=new Map<string,Promise<QuoteV27>>();
  function setIdentity(next:string|null){
    if(next===identity)return;
    identity=next;epoch++;snapshot=null;manifestFlight=null;documents.clear();flights.clear();
  }
  async function manifest(maxAgeMs:number){
    if(!identity)throw new Error('Sign in to load saved quotes.');
    if(snapshot&&maxAgeMs>0&&now()-snapshot.at<maxAgeMs)return snapshot.rows;
    if(manifestFlight){
      if(flightInvalidation===invalidation)return manifestFlight;
      // A save invalidates the outstanding manifest. Wait for it to settle, then
      // make a post-save read rather than sharing its pre-save response.
      await manifestFlight.catch(()=>{});return manifest(maxAgeMs);
    }
    const started=epoch,actor=identity,startedInvalidation=invalidation;
    const work=(async()=>{
      const rows:QuoteManifestEntry[]=[],seen=new Set<string>();let cursor:string|null=null;
      do{
        const response=await fetcher('/api/quote-workspaces/manifest'+(cursor?`?cursor=${encodeURIComponent(cursor)}`:''));
        const body=await response.json();
        if(started!==epoch)throw new Error('Quote identity changed. Refresh again.');
        if(!response.ok)throw new Error(body.error||'Quotes could not load.');
        if(body.actorKey!==actor)throw new Error('Quote identity changed. Sign in again.');
        if(!Array.isArray(body.workspaces))throw new Error('Quote manifest is incomplete.');
        for(const row of body.workspaces){
          if(!row.id||seen.has(row.id)||!Number.isSafeInteger(row.revision)||row.revision<0||typeof row.canEdit!=='boolean'||typeof row.lifecycle!=='string')throw new Error('Quote manifest is incomplete.');
          seen.add(row.id);if(row.lifecycle!=='archived')rows.push(row);
        }
        const next=body.nextCursor;
        if(next!==null&&(typeof next!=='string'||!seen.has(next)||next===cursor))throw new Error('Quote pagination is incomplete.');
        cursor=next;
      }while(cursor);
      if(started!==epoch)throw new Error('Quote identity changed. Refresh again.');
      if(startedInvalidation!==invalidation)throw new Error('Quotes changed during refresh. Read again.');
      for(const key of documents.keys())if(!rows.some(row=>row.id===key))documents.delete(key);
      snapshot={rows,at:now()};return rows;
    })();
    manifestFlight=work;flightInvalidation=startedInvalidation;
    try{return await work;}catch(error){if(started===epoch){snapshot=null;documents.clear();}throw error;}
    finally{if(manifestFlight===work)manifestFlight=null;}
  }
  async function load({excludeWorkspaceId,maxAgeMs=0}:{excludeWorkspaceId?:string;maxAgeMs?:number}={}){
    const started=epoch;
    const rows=(await manifest(maxAgeMs)).filter(row=>row.id!==excludeWorkspaceId);
    const results=await Promise.allSettled(rows.map(async row=>{
      let document:QuoteV27|null=null;
      if(row.revision){
        const cached=documents.get(row.id);
        if(cached?.version===row.revision)document=cached.document;
        else{
          const key=`${started}:${row.id}:${row.revision}`;
          let flight=flights.get(key);
          if(!flight){
            flight=(async()=>{
              const response=await fetcher(`/api/quote-workspaces/${row.id}/workbook?revision=${row.revision}`);
              const body=await response.json();
              if(!response.ok||!body.document||body.version!==row.revision)throw new Error('Quote revision unavailable.');
              const parsed=parse(body.document);
              if(started!==epoch)throw new Error('Quote identity changed.');
              if(snapshot?.rows.some(current=>current.id===row.id&&current.revision===row.revision))documents.set(row.id,{version:row.revision,document:parsed});
              return parsed;
            })();
            flights.set(key,flight);
          }
          try{document=await flight;}catch(error){documents.delete(row.id);throw error;}
          finally{if(flights.get(key)===flight)flights.delete(key);}
        }
      }else documents.delete(row.id);
      return {workspaceId:row.id,workspace:row.title,version:row.revision,canEdit:row.canEdit,document:document?structuredClone(document):null};
    }));
    if(started!==epoch)throw new Error('Quote identity changed. Refresh again.');
    if(!snapshot)throw new Error('Quote permissions must be refreshed.');
    const current=new Map(snapshot.rows.map(row=>[row.id,row]));
    return {quotes:results.flatMap(result=>{
      if(result.status!=='fulfilled')return [];
      const latest=current.get(result.value.workspaceId);
      return latest&&latest.revision===result.value.version?[{...result.value,workspace:latest.title,canEdit:latest.canEdit}]:[];
    }),failures:results.filter(result=>result.status==='rejected').length};
  }
  function invalidate(){invalidation++;snapshot=null;}
  return {setIdentity,load,invalidate};
}
