import test from 'node:test';
import assert from 'node:assert/strict';
import { readHubSpotProjectIdentity } from '../src/lib/hubspot-project-identity';

test('identity refresh reads only the bound deal, preserves exact names and uses no cache or redirects', async () => {
  let calls = 0;
  const fetcher = (async (url: string, options: RequestInit) => {
    calls++; assert.equal(url, 'https://api.hubapi.com/crm/v3/objects/deals/123?properties=dealname,job_number');
    assert.equal(options.method, 'GET'); assert.equal(options.cache, 'no-store'); assert.equal(options.redirect, 'error');
    assert.equal((options.headers as Record<string,string>).Authorization, 'Bearer private-fixture');
    return new Response(JSON.stringify({id:'123',properties:{dealname:'Exact name  ',job_number:'26223'}}));
  }) as typeof fetch;
  assert.deepEqual(await readHubSpotProjectIdentity('123','private-fixture',fetcher),{dealId:'123',name:'Exact name  ',jobNumber:'26223'});
  assert.equal(calls,1);
  await assert.rejects(readHubSpotProjectIdentity('../other','private-fixture',fetcher)); assert.equal(calls,1);
});
test('invalid provider identity and provider failures cannot become a project update', async () => {
  for (const body of [{id:'other',properties:{dealname:'Valid'}},{id:'123',properties:{dealname:''}},{id:'123',properties:{dealname:'Valid',job_number:12}}]) {
    await assert.rejects(readHubSpotProjectIdentity('123','fixture',(async()=>new Response(JSON.stringify(body))) as typeof fetch));
  }
  await assert.rejects(readHubSpotProjectIdentity('123','fixture',(async()=>new Response('PRIVATE',{status:401})) as typeof fetch),error=>!(error as Error).message.includes('PRIVATE'));
  assert.deepEqual(await readHubSpotProjectIdentity('123','fixture',(async()=>new Response(JSON.stringify({id:'123',properties:{dealname:'No number yet'}}))) as typeof fetch),{dealId:'123',name:'No number yet',jobNumber:null});
});
