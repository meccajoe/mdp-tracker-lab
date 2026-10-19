import {createClient} from '@supabase/supabase-js';
import {randomUUID} from 'node:crypto';
import {REPORTING_LAB_URL,reportingIdentity,reportingRateLimit} from '@/lib/lab-reporting-auth';
import {buildReport,reportOptions} from '@/lib/lab-reporting';
import {loadReportingSnapshot} from '@/lib/lab-reporting-store';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=60;
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
const json=(body:unknown,status=200)=>Response.json(body,{status,headers});

export async function GET(request:Request){
 const requestId=randomUUID();let credentialId:string|null=null,report:string|null=null;
 const reply=(body:unknown,status=200)=>{
  // IDs/status only: never headers, query values, source documents, or report bodies.
  console.info(JSON.stringify({event:'lab_reporting_read',requestId,credentialId,report,status}));
  const response=json(body,status);response.headers.set('X-Request-Id',requestId);return response;
 };
 if(process.env.NEXT_PUBLIC_SUPABASE_URL!==REPORTING_LAB_URL)return reply({error:'Lab reporting only.'},403);
 if(new URL(request.url).hostname!=='mdp-tracker-lab.vercel.app')return reply({error:'Use the primary Tracker Lab reporting URL.'},403);
 const identity=reportingIdentity(request.headers.get('authorization'),process.env.LAB_REPORTING_KEYS);
 if(!identity)return reply({error:'Reporting credential required.'},401);
 credentialId=identity.id;
 if(!reportingRateLimit(identity.id))return reply({error:'Too many requests. Retry in one minute.'},429);
 let options;
 try{options=reportOptions(new URL(request.url));}catch{return reply({error:'Invalid report query.'},400);}
 report=options.report;
 if(!identity.reports.includes(options.report))return reply({error:'Report is outside this credential scope.'},403);
 try{
  const key=process.env.SUPABASE_SERVICE_ROLE_KEY;
  if(!key)throw Error('Missing configuration.');
  const db=createClient(REPORTING_LAB_URL,key,{auth:{persistSession:false,autoRefreshToken:false}});
  const snapshot=await loadReportingSnapshot(db);
  const result=buildReport(snapshot,options);
  if(Buffer.byteLength(JSON.stringify(result),'utf8')>3_500_000)throw Error('Report exceeds response limit.');
  return reply(result);
 }catch{return reply({error:'Reporting sources unavailable; no partial report returned.'},503);}
}
const denied=()=>{const response=json({error:'Reporting is read-only.'},405);response.headers.set('Allow','GET, HEAD');return response;};
export const POST=denied,PUT=denied,PATCH=denied,DELETE=denied;
