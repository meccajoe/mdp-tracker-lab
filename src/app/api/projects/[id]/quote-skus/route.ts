import {requireQuoteProductAccess} from '@/lib/ada-server';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {validSkuReference} from '@/lib/lab-quote-allocation';
import {readHubSpotSkus} from '@/lib/lab-hubspot-skus';
export const maxDuration=45;
export async function GET(request:Request,context:{params:Promise<{id:string}>}){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const access=await requireQuoteProductAccess();if(!access.ok)return access.response;
 const {id}=await context.params;
 const [saved,project]=await Promise.all([
  access.actorSupabase.from('lab_project_quote_sources').select('snapshot').eq('project_id',id).maybeSingle(),
  access.actorSupabase.from('projects').select('hubspot_deal_id').eq('id',id).maybeSingle(),
 ]);
 if(saved.error||project.error)return json({error:'Project SKU access could not be verified.'},503);
 if(!saved.data||!project.data)return json({error:'Linked project not found.'},404);
 const h=saved.data.snapshot?.hubspot,quoteId=h?.selectedQuoteId;
 if(h?.dealId!==project.data.hubspot_deal_id||!/^\d+$/.test(quoteId??'')||!h?.quotes?.some((q:{id:string})=>q.id===quoteId))return json({error:'Confirm the selected HubSpot quote before loading SKUs.'},409);
 const cached=validSkuReference(h.skuReference,quoteId)?h.skuReference:null;
 if(cached&&!new URL(request.url).searchParams.has('refresh'))return json({reference:cached});
 const token=process.env.LAB_HUBSPOT_READ_TOKEN;
 if(!token)return cached?json({reference:cached,notice:'Live SKU refresh is unavailable. Showing the verified quote reference.'}):json({error:'HubSpot SKU reads need the Lab read credential.'},503);
 try{
  const live=await readHubSpotSkus(quoteId,token);
  // Preserve scoped group links only; the matcher verifies each against live names/SKUs.
  const reference={...live,...(cached?{workspaceId:cached.workspaceId,revision:cached.revision,links:cached.links}:{})};
  return json({reference});
 }catch{
  return cached?json({reference:cached,notice:'Live SKU refresh is unavailable. Showing the verified quote reference.'}):json({error:'HubSpot SKUs could not load. Check quote and line-item read access.'},502);
 }
}
