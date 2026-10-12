import {NextResponse} from 'next/server';
import {requireQuoteProductAccess} from '@/lib/ada-server';
import {fetchLiveCatalog} from '@/lib/quote-live-catalog';
import {catalogInput,catalogMaterial} from '@/lib/tracker-catalog';
export const dynamic='force-dynamic';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
async function access(){if(process.env.NEXT_PUBLIC_SUPABASE_URL!=='https://gkvaeqlqrthztobxitvn.supabase.co')return {ok:false as const,response:json({error:'Catalog is available only in Tracker Lab.'},403)};return requireQuoteProductAccess();}
export async function GET(){
 const actor=await access();if(!actor.ok)return actor.response;
 const imported=await actor.actorSupabase.from('lab_material_catalog_import').select('imported_count,warnings,imported_at').maybeSingle();
 if(imported.error){if(['42P01','PGRST205'].includes(imported.error.code)){try{const source=await fetchLiveCatalog();return json({...source,entries:[],ready:false,initialized:false,canEdit:false,setupMessage:'Tracker catalog needs its lab storage migration. Google Sheet selections remain available until the one-time copy.'});}catch{}}return json({error:'Tracker catalog storage could not load. Saved quote prices remain unchanged.',ready:false},503);}
 const capability=await actor.actorSupabase.from('quote_user_capabilities').select('capability').eq('capability','create_workspace').is('revoked_at',null).limit(1);
 const canEdit=!capability.error&&Boolean(capability.data?.length),materials=[];
 if(!imported.data){try{const source=await fetchLiveCatalog();return json({...source,entries:[],ready:true,initialized:false,canEdit,setupMessage:'Copy Google Sheet DB once to activate the Tracker catalog.'});}catch{return json({materials:[],entries:[],ready:true,initialized:false,canEdit,warnings:[],setupMessage:'Google Sheet is unavailable. Retry the one-time import later.'});}}
 for(let offset=0;;offset+=500){const result=await actor.actorSupabase.from('lab_material_catalog').select('item_id,revision,name,unit,unit_cost,source').order('name').order('item_id').range(offset,offset+499);if(result.error)return json({error:'Tracker catalog could not load.'},503);materials.push(...result.data.map(catalogMaterial));if(result.data.length<500)break;}
 return json({entries:materials,materials:materials.filter(row=>row.unitCost!==null&&row.unit.trim()),ready:true,initialized:Boolean(imported.data),canEdit,warnings:imported.data?.warnings??[],fetchedAt:new Date().toISOString()});
}
export async function POST(request:Request){
 const actor=await access();if(!actor.ok)return actor.response;
 let action,payload;
 try{const raw=await request.text();if(raw.length>12000)throw new Error('Request is too large.');const body=JSON.parse(raw);action=body.action;
 if(action==='import'){const source=await fetchLiveCatalog();payload={materials:[...source.materials,...source.incomplete],warnings:source.warnings};}
 else {payload=catalogInput(body);if(action==='edit'){if(!/^[0-9a-f-]{36}$/i.test(body.itemId)||!Number.isSafeInteger(body.expectedVersion)||body.expectedVersion<1)throw new Error('Invalid catalog revision.');payload={...payload,itemId:body.itemId,expectedVersion:body.expectedVersion};}else if(action!=='add')throw new Error('Invalid action.');}
 }catch(error){return json({error:error instanceof Error?error.message:'Invalid request.'},400);}
 const result=await actor.actorSupabase.rpc('lab_catalog_write',{action,payload});
 if(result.error)return json({error:result.error.code==='PT409'?result.error.message:result.error.code==='23505'?'Another catalog entry already has that name.':'Catalog could not save. Check lab storage setup and edit permission.'},result.error.code==='PT409'||result.error.code==='23505'?409:403);
 return json({...result.data,...(result.data.entry?{material:catalogMaterial(result.data.entry)}:{})});
}
