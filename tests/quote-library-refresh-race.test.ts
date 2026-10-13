import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createQuoteLibraryCache,type QuoteManifestEntry} from '../src/lib/quote-library-cache';
import {parseQuoteV27} from '../src/lib/quote-v27-validation';
const actor='synthetic:lab@example.test';
const document=JSON.parse(readFileSync(new URL('../src/data/quote-v27-fonroche.json',import.meta.url),'utf8'));
function scenario(){
 let rows:QuoteManifestEntry[]=Array.from({length:26},(_,i)=>({id:String(i),title:'Synthetic '+i,revision:1,canEdit:true,lifecycle:'draft'}));
 const calls:string[]=[];let pending:Promise<Response>|null=null,release!:(r:Response)=>void;
 const cache=createQuoteLibraryCache(async url=>{calls.push(url);if(url.includes('/manifest')){if(pending){const held=pending;pending=null;return held;}return Response.json({actorKey:actor,workspaces:rows,nextCursor:null});}return Response.json({document,version:Number(new URL(url,'https://lab.example.test').searchParams.get('revision'))});},parseQuoteV27);cache.setIdentity(actor);
 return {cache,calls,get rows(){return rows;},set rows(next){rows=next;},hold(){pending=new Promise(resolve=>release=resolve);},release(value:unknown){release(Response.json(value));},body(){return {actorKey:actor,workspaces:structuredClone(rows),nextCursor:null};}};
}
test('save overlapping a warm manifest reads only the changed workbook after fresh permission metadata',async()=>{
 const s=scenario();await s.cache.load();s.calls.length=0;s.hold();const before=s.body();const old=s.cache.load();
 s.rows[0].revision=2;s.rows=s.rows.filter(row=>row.id!=='1'&&row.id!=='2');s.rows[1].canEdit=false;s.cache.invalidate();
 const saved=s.cache.load();s.release(before);await assert.rejects(old,/changed during refresh/);const result=await saved;
 assert.equal(result.quotes.length,24);assert.ok(!result.quotes.some(row=>row.workspaceId==='1'||row.workspaceId==='2'));assert.equal(result.quotes.find(row=>row.workspaceId==='3')?.canEdit,false);
 assert.equal(s.calls.filter(url=>url.includes('/manifest')).length,2);assert.deepEqual(s.calls.filter(url=>url.includes('/workbook')),['/api/quote-workspaces/0/workbook?revision=2']);
 s.calls.length=0;await s.cache.load();assert.equal(s.calls.length,1);
});
test('malformed manifest overlapping a save still discards cached documents and fails closed',async()=>{
 const s=scenario();await s.cache.load();s.calls.length=0;s.hold();const old=s.cache.load();s.cache.invalidate();const recovered=s.cache.load();
 s.release({actorKey:actor,workspaces:[],nextCursor:'missing'});await assert.rejects(old,/pagination/);assert.equal((await recovered).quotes.length,26);
 assert.equal(s.calls.filter(url=>url.includes('/workbook')).length,26);
});
