// A forced refresh during an outstanding read is queued, never swallowed by
// single-flight deduplication. Invalidation prevents stale/unmounted UI commits.
export function createVisibleRefresh<T>(read:()=>Promise<T>,apply:(value:T)=>void,fail:(error:unknown)=>void,canRun:()=>boolean){
  let disposed=false,epoch=0,pending=false,flight:Promise<void>|null=null;
  function request(fresh=false):Promise<void>{
    if(disposed)return Promise.resolve();
    if(flight){if(fresh){pending=true;epoch++;}return flight;}
    if(!canRun()){pending=true;return Promise.resolve();}
    pending=false;
    const run=(async()=>{
      do{
        pending=false;const started=epoch;
        try{const value=await read();if(!disposed&&started===epoch&&canRun())apply(value);}
        catch(error){if(!disposed&&started===epoch&&canRun())fail(error);}
      }while(!disposed&&pending&&canRun());
    })();
    flight=run;
    void run.finally(()=>{if(flight===run)flight=null;});
    return run;
  }
  return {request,pause:()=>{epoch++;pending=true;},dispose:()=>{disposed=true;epoch++;}};
}
