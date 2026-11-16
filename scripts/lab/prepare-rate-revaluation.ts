// Offline preparation only. Input contains private Lab captures and approvals;
// keep both input/output outside Git. Publishing the prepared packets is separate.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {applyLabRateApprovals} from '../../src/lib/lab-project-rate-approvals';
import {attachProjectCosting} from '../../src/lib/lab-project-costing';
import {summarizeProjectActivity} from '../../src/lib/lab-project-activity';
const [inputPath,outputPath]=process.argv.slice(2);
if(!inputPath||!outputPath)throw Error('Provide private input and output paths.');
const input=JSON.parse(readFileSync(inputPath,'utf8'));
const output=input.projects.flatMap((p:any)=>{
 const next=applyLabRateApprovals(p.snapshot,p.evidence,input.approvals,input.resolvedAt);
 if(next===p.evidence)return [];
 const summary=summarizeProjectActivity(attachProjectCosting(p.snapshot,next,p.activity_id,p.activity_hash));
 return [{projectId:p.project_id,activityId:p.activity_id,priorCostingId:p.costing_id,resolvedAt:next.resolvedAt,sourceSha256:createHash('sha256').update(JSON.stringify(next)).digest('hex'),evidence:next,
 summary:{hours:summary.hours,knownCost:summary.knownCost,missingHours:summary.missingHours,expenses:summary.expenses}}];
});
writeFileSync(outputPath,JSON.stringify(output),{mode:0o600});
console.log(JSON.stringify(output.map(({projectId,summary}:any)=>({projectId,...summary}))));
