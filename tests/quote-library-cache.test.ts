import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQuoteLibraryCache, type QuoteManifestEntry} from '../src/lib/quote-library-cache';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
import {calculateQuoteV27} from '../src/lib/quote-v27';
const document=()=>JSON.parse(readFileSync(new URL('../src/data/quote-v27-fonroche.json',import.meta.url),'utf8'));
const actor='joe:joe@lab.test';
const row=(id:string,revision=1):QuoteManifestEntry=>({id,title:id,revision,canEdit:true,lifecycle:'draft'});
const deferred=<T,>()=>{let resolve!:(value:T)=>void;const promise=new Promise<T>(r=>resolve=r);return {promise,resolve};};
function fixture(count=24){
  const calls:string[]=[];let rows=Array.from({length:count},(_,i)=>row(String(i).padStart(3,'0'))),time=0;
  let failPage=false,failQuote:string|null=null,key=actor,hold:ReturnType<typeof deferred<Response>>|null=null;
  const cache=createQuoteLibraryCache(async url=>{
    calls.push(url);
    if(url.startsWith('/api/quote-workspaces/manifest')){
      if(failPage&&url.includes('cursor'))return Response.json({error:'Page unavailable'},{status:500});
      const cursor=new URL(url,'https://lab.test').searchParams.get('cursor');
      const start=cursor?rows.findIndex(r=>r.id===cursor)+1:0, page=rows.slice(start,start+100);
      return Response.json({actorKey:key,workspaces:page,nextCursor:start+100<rows.length?page.at(-1)!.id:null});
    }
    if(hold){const pending=hold;hold=null;return pending.promise;}
    const id=url.split('/')[3],version=Number(new URL(url,'https://lab.test').searchParams.get('revision'));
    return id===failQuote?Response.json({error:'Revoked'},{status:403}):Response.json({document:document(),version});
  },parseQuoteV27,()=>time);
  cache.setIdentity(actor);
  return {cache,calls,get rows(){return rows;},set rows(value){rows=value;},set time(value:number){time=value;},set failPage(value:boolean){failPage=value;},set failQuote(value:string|null){failQuote=value;},set key(value:string){key=value;},set hold(value:ReturnType<typeof deferred<Response>>){hold=value;}};
}
test('24 quotes: initial 25 requests, unchanged refresh 1, changed revision 2; legacy totals unchanged',async()=>{
  const f=fixture();const first=await f.cache.load();assert.equal(f.calls.length,25);assert.equal(first.quotes.length,24);
  assert.equal(calculateQuoteV27(first.quotes[0].document!).totals.price,28953.192);
  f.calls.length=0;await f.cache.load();assert.equal(f.calls.length,1);
  f.rows[3].revision=2;f.calls.length=0;const updated=await f.cache.load();assert.equal(f.calls.length,2);assert.equal(updated.quotes[3].version,2);
});
test('permissions, names, archive/revoke and restore refresh even without a revision change',async()=>{
  const f=fixture(3);await f.cache.load();f.rows=[{...f.rows[0],title:'Renamed',canEdit:false},{...f.rows[1],lifecycle:'archived'}];f.calls.length=0;
  const changed=await f.cache.load();assert.equal(changed.quotes.length,1);assert.equal(changed.quotes[0].canEdit,false);assert.equal(changed.quotes[0].workspace,'Renamed');assert.equal(f.calls.length,1);
  f.rows=f.rows.filter(r=>r.lifecycle!=='archived');f.rows.push(row('001'));f.calls.length=0;await f.cache.load();assert.equal(f.calls.length,2);
});
test('all cursor pages are consumed; incomplete page fails closed and forces document reread',async()=>{
  const f=fixture(201);const result=await f.cache.load();assert.equal(result.quotes.length,201);assert.equal(f.calls.filter(x=>x.includes('manifest')).length,3);
  f.failPage=true;await assert.rejects(f.cache.load(),/Page unavailable/);f.failPage=false;f.calls.length=0;await f.cache.load();assert.equal(f.calls.length,204);
});
test('Takeoffs excludes current quote before fetching and reuses bounded-fresh manifest/documents',async()=>{
  const f=fixture(4);await f.cache.load({excludeWorkspaceId:'000',maxAgeMs:60000});assert.equal(f.calls.length,4);assert.ok(!f.calls.some(x=>x.includes('/000/')));
  f.calls.length=0;await f.cache.load({excludeWorkspaceId:'000',maxAgeMs:60000});assert.equal(f.calls.length,0);
  f.time=60000;await f.cache.load({excludeWorkspaceId:'000',maxAgeMs:60000});assert.equal(f.calls.length,1);
  f.cache.invalidate();await f.cache.load({excludeWorkspaceId:'000',maxAgeMs:60000});assert.equal(f.calls.length,2);
});
test('concurrent consumers deduplicate manifest and revision reads; returned documents cannot poison cache',async()=>{
  const f=fixture(4);const [a,b]=await Promise.all([f.cache.load(),f.cache.load()]);assert.equal(f.calls.length,5);
  a.quotes[0].document!.lines[0].name='Unsaved';assert.notEqual(b.quotes[0].document!.lines[0].name,'Unsaved');
  const reread=await f.cache.load();assert.notEqual(reread.quotes[0].document!.lines[0].name,'Unsaved');
});
test('no saved document is cached without a revision; failed workbook is omitted and marked incomplete',async()=>{
  const f=fixture(3);f.rows[0].revision=0;f.failQuote='001';const result=await f.cache.load();assert.equal(result.failures,1);assert.equal(result.quotes.length,2);assert.equal(result.quotes[0].document,null);
  f.failQuote=null;f.calls.length=0;await f.cache.load();assert.equal(f.calls.length,2);
});
test('identity change clears documents and prevents late old-actor results',async()=>{
  const f=fixture(1),pending=deferred<Response>();f.hold=pending;const old=f.cache.load();await new Promise(r=>setTimeout(r,0));
  f.cache.setIdentity('paul:paul@lab.test');f.key='paul:paul@lab.test';pending.resolve(Response.json({document:document(),version:1}));await assert.rejects(old,/identity changed/);
  f.calls.length=0;await f.cache.load();assert.equal(f.calls.length,2);f.cache.setIdentity(null);await assert.rejects(f.cache.load(),/Sign in/);
});
test('revocation during a slow workbook read cannot reintroduce the removed document',async()=>{
  const f=fixture(1),pending=deferred<Response>();f.hold=pending;const old=f.cache.load();await new Promise(r=>setTimeout(r,0));
  f.rows=[];await f.cache.load();pending.resolve(Response.json({document:document(),version:1}));assert.equal((await old).quotes.length,0);
  f.rows=[row('000')];f.calls.length=0;await f.cache.load();assert.equal(f.calls.length,2);
});
test('server/client actor mismatch and malformed pagination never return cached data',async()=>{
  const f=fixture();await f.cache.load();f.key='different';await assert.rejects(f.cache.load(),/identity changed/);
  const cache=createQuoteLibraryCache(async()=>Response.json({actorKey:actor,workspaces:[],nextCursor:'missing'}),parseQuoteV27);cache.setIdentity(actor);await assert.rejects(cache.load(),/pagination/);
});
test('save during a pending manifest triggers a separate post-save read without concurrent manifests',async()=>{
  const pending=deferred<Response>();let reads=0,active=0,maxActive=0;const calls:string[]=[];
  const cache=createQuoteLibraryCache(async url=>{
    calls.push(url);
    if(url.includes('manifest')){active++;maxActive=Math.max(active,maxActive);const response=++reads===1?await pending.promise:Response.json({actorKey:actor,workspaces:[row('one',2)],nextCursor:null});active--;return response;}
    return Response.json({version:2,document:document()});
  },parseQuoteV27);cache.setIdentity(actor);
  const old=cache.load();cache.invalidate();const saved=cache.load();
  pending.resolve(Response.json({actorKey:actor,workspaces:[row('one')],nextCursor:null}));
  await assert.rejects(old,/changed during refresh/);assert.equal((await saved).quotes[0].version,2);assert.equal(reads,2);assert.equal(maxActive,1);assert.equal(calls.length,3);
});
