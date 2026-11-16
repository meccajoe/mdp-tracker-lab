import type {SkuReference} from './lab-quote-allocation';
export async function readHubSpotSkus(quoteId:string,token:string,fetcher:typeof fetch=fetch):Promise<SkuReference>{
 if(!/^\d+$/.test(quoteId))throw Error('INVALID_QUOTE');
 const request=async(path:string,body?:unknown)=>{
  const response=await fetcher(`https://api.hubapi.com${path}`,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),redirect:'error',cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw Error(response.status===403?'SKU_READ_PERMISSION_REQUIRED':'SKU_READ_FAILED');return response.json();
 };
 const quote=await request(`/crm/v3/objects/quotes/${quoteId}?associations=line_items`);
 if(quote.id!==quoteId||quote.associations?.line_items?.paging?.next)throw Error('QUOTE_ASSOCIATIONS_CHANGED_OR_TRUNCATED');
 const ids=(quote.associations?.line_items?.results??[]).map((r:{id:string})=>r.id);
 if(ids.length>200||new Set(ids).size!==ids.length||!ids.every((id:unknown)=>typeof id==='string'&&/^\d+$/.test(id)))throw Error('INVALID_LINE_ASSOCIATIONS');
 if(!ids.length)return {quoteId,verifiedAt:new Date().toISOString(),source:'hubspot-api',lines:[]};
 const batches=[];for(let i=0;i<ids.length;i+=100)batches.push(ids.slice(i,i+100));
 const responses=await Promise.all(batches.map(batch=>request('/crm/v3/objects/line_items/batch/read',{properties:['name','hs_sku'],inputs:batch.map((id:string)=>({id}))})));
 if(responses.some(r=>r.errors?.length||!Array.isArray(r.results)))throw Error('INCOMPLETE_SKU_READ');
 const data={results:responses.flatMap(r=>r.results)};
 if(data.results.length!==ids.length||new Set(data.results.map((r:{id:string})=>r.id)).size!==ids.length||data.results.some((r:{id:string;properties?:{name?:string;hs_sku?:string}})=>!ids.includes(r.id)||typeof r.properties?.name!=='string'||!r.properties.name.trim()||r.properties.name.length>500||typeof(r.properties.hs_sku??'')!=='string'||(r.properties.hs_sku??'').length>100))throw Error('INCOMPLETE_SKU_READ');
 return {quoteId,verifiedAt:new Date().toISOString(),source:'hubspot-api',lines:data.results.map((r:{properties:{name:string;hs_sku?:string}})=>({name:r.properties.name,sku:r.properties.hs_sku??''}))};
}
