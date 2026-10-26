import {test} from 'node:test';
import assert from 'node:assert/strict';
import {groupQuoteVersions} from '../src/lib/quote-version-groups';
const row=(id:string,group:string,selected=false,created='2026-10-01')=>({id,capacity_group:group,capacity_selected:selected,created_at:created});
const compare=(a:{id:string},b:{id:string})=>a.id.localeCompare(b.id);
test('selected version leads its group even if another version is newer; input is preserved',()=>{
 const rows=[row('old','g',true),row('new','g',false,'2026-10-20'),row('separate','s',true)];
 const before=JSON.stringify(rows),groups=groupQuoteVersions(rows,()=>true,compare);
 assert.equal(groups.length,2);assert.equal(groups[0].primary.id,'old');assert.equal(groups[0].others[0].id,'new');assert.equal(JSON.stringify(rows),before);
});
test('searching an older version keeps selected version and complete group in context',()=>{
 const groups=groupQuoteVersions([row('original','g'),row('v2','g',true),row('unrelated','s',true)],r=>r.id==='original',compare);
 assert.equal(groups.length,1);assert.equal(groups[0].primary.id,'v2');assert.deepEqual(groups[0].others.map(r=>r.id),['original']);
});
test('missing selection does not select a fallback; unknown groups stay independent',()=>{
 const groups=groupQuoteVersions([row('old','g'),row('new','g',false,'2026-10-20'),row('a',''),row('b','')],()=>true,compare);
 assert.equal(groups.length,3);assert.equal(groups[2].primary.id,'new');assert.equal(groups[2].primary.capacity_selected,false);
});
