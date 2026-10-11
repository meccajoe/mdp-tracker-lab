import {requireQuoteProductAccess} from '@/lib/ada-server';
import {createBlankQuoteV27} from '@/lib/quote-v27-template';
import {quoteDefaults,quoteFromDefaults} from '@/lib/quote-defaults';
import {labManagementGuard,managementJson as json,managementError,managementSetup} from '@/lib/quote-management-server';
export const dynamic='force-dynamic';
export async function GET(){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const actor=await requireQuoteProductAccess();if(!actor.ok)return actor.response;
 const result=await actor.actorSupabase.from('lab_quote_settings_revisions').select('revision,document').order('revision',{ascending:false}).limit(1).maybeSingle();
 if(result.error)return json({error:managementSetup,ready:false,canEdit:false},503);
 const capability=await actor.actorSupabase.from('quote_user_capabilities').select('capability').eq('user_id',actor.actorId).eq('email_normalized',actor.actorEmail).eq('capability','create_workspace').is('revoked_at',null).limit(1);
 try{return json({document:result.data?quoteDefaults(quoteFromDefaults(result.data.document)):quoteDefaults(createBlankQuoteV27()),version:result.data?.revision??0,ready:true,canEdit:!capability.error&&Boolean(capability.data?.length)});}catch{return json({error:'Saved global settings are invalid; no defaults have been replaced.'},422);}
}
export async function POST(request:Request){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const actor=await requireQuoteProductAccess();if(!actor.ok)return actor.response;
 let document,version;
 try{const raw=await request.text();if(raw.length>100000)throw new Error('Settings are too large.');const body=JSON.parse(raw);version=body.expectedVersion;if(!Number.isSafeInteger(version)||version<0||version>=2147483647)throw new Error('Invalid settings version.');document=quoteDefaults(quoteFromDefaults(body.document));}catch(e){return json({error:e instanceof Error?e.message:'Invalid settings.'},400);}
 const result=await actor.actorSupabase.from('lab_quote_settings_revisions').insert({revision:version+1,document,created_by:actor.actorId,created_by_email:actor.actorEmail}).select('revision').single();
 if(result.error)return managementError(result.error);
 return json({version:result.data.revision},201);
}
