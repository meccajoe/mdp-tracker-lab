import {timingSafeEqual} from 'node:crypto';
import {labManagementGuard,managementJson as json} from '@/lib/quote-management-server';
import {chicagoClock} from '@/lib/lab-project-sync';
import {executeSync,syncConfigured} from '../server';
export const maxDuration=300;
export async function GET(request:Request){
 const blocked=labManagementGuard();if(blocked)return blocked;
 const secret=process.env.CRON_SECRET,provided=request.headers.get('authorization')??'';
 const expected=secret?`Bearer ${secret}`:'';
 const receivedBytes=Buffer.from(provided),expectedBytes=Buffer.from(expected);
 if(!secret||secret.length<32||receivedBytes.length!==expectedBytes.length||!timingSafeEqual(receivedBytes,expectedBytes))return json({error:'Unauthorized'},401);
 if(process.env.LAB_DAILY_SYNC_ENABLED!=='true')return json({skipped:true,reason:'DISABLED'});
 if(chicagoClock().hour!==6)return json({skipped:true,reason:'OUTSIDE_CHICAGO_WINDOW'});
 if(!syncConfigured())return json({error:'Sync source configuration missing.'},503);
 try{return json(await executeSync('scheduled'));}catch{return json({error:'Scheduled sync failed. Check the run log.'},503);}
}
