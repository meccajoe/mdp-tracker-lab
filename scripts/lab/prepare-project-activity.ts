// Offline preparation only: no credentials, network access or database writes.
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { validateActivityCapture, summarizeProjectActivity } from '../../src/lib/lab-project-activity';
const args=process.argv.slice(2);
function argument(name:string){const i=args.indexOf(name);if(i<0||!args[i+1])throw Error(`Missing ${name}`);return args[i+1];}
const projectId=argument('--project'),job=argument('--job'),deal=argument('--deal');
if(!/^[a-zA-Z0-9-]+$/.test(projectId)||!/^\d+$/.test(job)||!/^\d+$/.test(deal))throw Error('Invalid project identity.');
const capture:unknown=JSON.parse(readFileSync(argument('--input'),'utf8'));
validateActivityCapture(capture);
if(capture.project.job_number!==job||capture.project.hubspot_deal_id!==deal)throw Error('Source project identity does not match the reviewed destination.');
const serialized=JSON.stringify(capture),hash=createHash('sha256').update(serialized).digest('hex');
const literal=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
const sql=`begin;
do $guard$ begin
 perform p.id from public.projects p join public.lab_project_quote_sources s on s.project_id=p.id
 where p.id=${literal(projectId)} and p.job_number=${literal(job)} and p.hubspot_deal_id=${literal(deal)} for share of p;
 if not found then raise exception 'Lab project identity no longer matches the reviewed capture.'; end if;
 if exists(select 1 from public.lab_project_activity_snapshots where project_id=${literal(projectId)} and captured_at=${literal(capture.capturedAt)}::timestamptz and source_sha256<>${literal(hash)}) then raise exception 'Conflicting capture at the same timestamp.'; end if;
end $guard$;
insert into public.lab_project_activity_snapshots(project_id,source_project_id,job_number,hubspot_deal_id,captured_at,source_sha256,snapshot)
values(${literal(projectId)},${literal(capture.project.id)},${literal(job)},${literal(deal)},${literal(capture.capturedAt)},${literal(hash)},${literal(serialized)}::jsonb)
on conflict(project_id,captured_at) do nothing;
commit;
`;
writeFileSync(argument('--output'),sql,{mode:0o600});
const summary=summarizeProjectActivity(capture);
console.log(JSON.stringify({projectId,job,deal,capturedAt:capture.capturedAt,sourceSha256:hash,expenseRows:capture.expenses.length,laborRows:capture.labor.length,expenseTotal:summary.expenses,laborHours:summary.hours,knownBaseWageCost:summary.knownCost,missingRateHours:summary.missingHours}));
