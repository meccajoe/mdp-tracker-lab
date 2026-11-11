// Offline preparation only. Apply the reviewed SQL only to the Lab database.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {validateActivityCapture,summarizeProjectActivity} from '../../src/lib/lab-project-activity';
import {validateProjectCosting,attachProjectCosting,type ProjectCostingPacket} from '../../src/lib/lab-project-costing';
const args=process.argv.slice(2),arg=(name:string)=>{const i=args.indexOf(name);if(i<0||!args[i+1])throw Error(`Missing ${name}`);return args[i+1];};
const capture=JSON.parse(readFileSync(arg('--activity'),'utf8'));validateActivityCapture(capture);
const raw=JSON.parse(readFileSync(arg('--evidence'),'utf8')),snapshotId=arg('--snapshot'),sourceHash=arg('--snapshot-hash');
if(!/^[a-f0-9-]{36}$/.test(snapshotId)||!/^[a-f0-9]{64}$/.test(sourceHash))throw Error('Invalid reviewed snapshot identity.');
const sha=(v:string)=>createHash('sha256').update(v).digest('hex');
const packet:ProjectCostingPacket={version:1,activitySnapshotId:snapshotId,activitySourceSha256:sourceHash,sourceProjectId:raw.project.id,jobNumber:raw.project.jobNumber,dealId:raw.project.dealId,resolvedAt:raw.resolvedAt,sourceView:'public.project_labor_reconciliation_summary',sourceViewSha256:sha(readFileSync(arg('--view-definition'),'utf8').trim()),expected:{rows:raw.summary.source_row_count??0,hours:Number(raw.summary.total_hours??0),knownCost:Number(raw.summary.verified_direct_wages??0),missingHours:Number(raw.summary.missing_rate_hours??0),excludedHours:Number(raw.summary.excluded_project_cost_hours??0)},rows:raw.rows};
validateProjectCosting(capture,packet,snapshotId,sourceHash);
const serialized=JSON.stringify(packet),hash=sha(serialized),literal=(s:string)=>"'"+s.replace(/'/g,"''")+"'";
const sql=`begin;
do $guard$ begin
 perform a.id from public.lab_project_activity_snapshots a join public.projects p on p.id=a.project_id
 where a.id=${literal(snapshotId)}::uuid and a.source_sha256=${literal(sourceHash)} and a.source_project_id=${literal(packet.sourceProjectId)}
 and p.job_number=${literal(packet.jobNumber)} and p.hubspot_deal_id=${literal(packet.dealId)} for share of a,p;
 if not found then raise exception 'Activity or project identity no longer matches the reviewed cost evidence.'; end if;
 if exists(select 1 from public.lab_project_costing_snapshots where activity_snapshot_id=${literal(snapshotId)}::uuid and resolved_at=${literal(packet.resolvedAt)}::timestamptz and source_sha256<>${literal(hash)}) then raise exception 'Conflicting costing export at the same timestamp.'; end if;
end $guard$;
insert into public.lab_project_costing_snapshots(activity_snapshot_id,resolved_at,source_sha256,evidence)
values(${literal(snapshotId)},${literal(packet.resolvedAt)},${literal(hash)},${literal(serialized)}::jsonb)
on conflict(activity_snapshot_id,resolved_at) do nothing;
commit;`;
writeFileSync(arg('--sql'),sql,{mode:0o600});writeFileSync(arg('--output'),serialized,{mode:0o600});
const summary=summarizeProjectActivity(attachProjectCosting(capture,packet,snapshotId,sourceHash));
console.log(JSON.stringify({snapshotId,sourceSha256:hash,hours:summary.hours,knownCost:summary.knownCost,missingHours:summary.missingHours,exceptions:summary.exceptions}));
