import {NextResponse} from 'next/server';
export const managementJson=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
export const missingManagement=(code?:string)=>['42P01','PGRST205','PGRST202','42883'].includes(code??'');
export const managementSetup='Global settings, cloning and Draft/Final controls need the lab quote-management database update. Existing quotes are preserved.';
export function labManagementGuard(){return process.env.NEXT_PUBLIC_SUPABASE_URL==='https://gkvaeqlqrthztobxitvn.supabase.co'?null:managementJson({error:'Quote management is available only in Tracker Lab.'},403);}
export function managementError(error:{code?:string;message?:string}){
 return managementJson({error:missingManagement(error.code)?managementSetup:error.code==='PT409'?'This quote or its defaults changed on another device. Reload before trying again.':error.code==='42501'?'You do not have permission for this action.':error.code==='22023'?error.message:'The change could not be saved.'},missingManagement(error.code)?503:error.code==='PT409'?409:error.code==='42501'?403:400);
}
