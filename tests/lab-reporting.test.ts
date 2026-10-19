import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {reportingIdentity,reportingRateLimit} from '../src/lib/lab-reporting-auth';
import {buildReport,reportOptions,type ReportingSnapshot} from '../src/lib/lab-reporting';
import {createBlankQuoteV27} from '../src/lib/quote-v27-template';
import {emptyCapacity,capacityProject} from '../src/lib/capacity';
import {dashboardLoad} from '../src/lib/capacity-dashboard';
import {emptyPlan} from '../src/lib/production-plan';

const token='tlr_'+'a'.repeat(43),sha256=createHash('sha256').update(token).digest('hex');
test('dedicated reporting credentials expire, revoke, reject sessions and scope reports',()=>{
 const key={id:'paul-grok',sha256,expiresAt:'2026-11-19T00:00:00Z',reports:['capacity']};
 const registry=JSON.stringify([key]),now=Date.parse('2026-10-19');
 assert.equal(reportingIdentity('Bearer '+token,registry,now)?.id,'paul-grok');
 for(const value of ['Bearer '+token+'x','Bearer eyJhuman.jwt.token',token,'Bearer '+token.replace('a','b')])assert.equal(reportingIdentity(value,registry,now),null);
 assert.equal(reportingIdentity('Bearer '+token,'[]',now),null);
 assert.equal(reportingIdentity('Bearer '+token,registry,Date.parse('2026-12-01')),null);
 assert.equal(reportingIdentity('Bearer '+token,'broken',now),null);
 assert.equal(reportingIdentity('Bearer '+token,JSON.stringify([{...key,reports:['write']}]),now),null);
 for(let i=0;i<30;i++)assert.equal(reportingRateLimit('test-key',now),true);
 assert.equal(reportingRateLimit('test-key',now),false);
 assert.equal(reportingRateLimit('test-key',now+60000),true);
});

function fixture():ReportingSnapshot{
 const settings=emptyCapacity();settings.settings.weekStart='2026-10-19';
 settings.settings.roster=[{id:'p1',name:'Sample Person',primary:'Carpentry',secondary:'I&D',hours:40,active:true,rate:987654.32,notes:'SECRET_WAGE_NOTE'}];
 const quote=createBlankQuoteV27();quote.schedule={buildStart:'2026-10-19',buildFinish:'2026-10-23',installDate:'2026-10-26',status:'Closed won'};
 quote.lines[0].priceOverride=765432.10;
 const plan=emptyPlan();plan.quoteVersion=1;plan.notes='SECRET_FINANCIAL_NOTE';
 plan.tasks=[{id:'t',itemId:'i',item:'Cabinet',stage:'carpentry',trade:'Carpentry',hours:8,start:'2026-10-19',finish:'2026-10-19',daily:[{date:'2026-10-19',hours:8}],predecessors:[],locked:false}];
 const snapshot:ReportingSnapshot={quotes:[{workspaceId:'w',workspace:'Sample project',version:1,document:quote,productionPlan:plan}],settings,rosterVersion:1,plans:{w:1},team:{latest:null,approved:null}};
 snapshot.team.latest={revision:1,created_at:'2026-10-19',document:{sources:{roster:1,quotes:[{id:'w',quote:1,plan:1}]},result:{allocations:[{taskKey:'t',workspaceId:'w',project:'Sample project',item:'Cabinet',trade:'Carpentry',personId:'p1',person:'Sample Person',date:'2026-10-19',hours:8,secondary:false}],unfilled:[{taskKey:'u',project:'Sample project',item:'Cabinet',trade:'CNC',hours:4,reason:'SECRET_REASON'}],warnings:['SECRET_WARNING'],people:settings.settings.roster,options:{start:'2026-10-19',finish:'2026-10-23',priority:['w'],availability:[]},totalHours:12,assignedHours:8}}};
 return snapshot;
}

test('all reports exclude financial fields and nested staff/plan notes; use exact shared capacity math',()=>{
 const snapshot=fixture();
 for(const report of ['projects','roster','capacity','team-schedule']){
  const options=reportOptions(new URL('https://lab.test?report='+report+'&start=2026-10-19&weeks=4'));
  const serialized=JSON.stringify(buildReport(snapshot,options));
  for(const forbidden of ['987654','765432','SECRET_','priceOverride','"rate"','"notes"','"price"','"margin"','"document"','"people"']){
   if(forbidden==='"people"'&&report==='roster')continue;
   assert.equal(serialized.includes(forbidden),false,report+' leaks '+forbidden);
  }
 }
 const options=reportOptions(new URL('https://lab.test?report=capacity&start=2026-10-19&weeks=4'));
 const result=buildReport(snapshot,options) as {weeks:{shop:{needed:number;available:number}}[]};
 const expected=dashboardLoad(snapshot.quotes.map(q=>capacityProject(q)),snapshot.settings.settings,null,'expected',4);
 assert.equal(result.weeks[0].shop.needed,expected.load.expected[0]);
 assert.equal(result.weeks[0].shop.available,expected.shopAvailable[0]);
 const team=buildReport(snapshot,reportOptions(new URL('https://lab.test?report=team-schedule'))) as {latest:{stale:boolean}};
 assert.equal(team.latest.stale,false);snapshot.plans.w=2;
 assert.equal((buildReport(snapshot,reportOptions(new URL('https://lab.test?report=team-schedule'))) as typeof team).latest.stale,true);
});

test('invalid query bounds and malformed saved team fields fail closed',()=>{
 for(const query of ['weeks=0','weeks=27','start=2026-02-30','basis=money','report=sql','access_token=secret','report=roster&report=projects'])assert.throws(()=>reportOptions(new URL('https://lab.test?'+query)));
 const snapshot=fixture();
 (snapshot.team.latest!.document.result.allocations[0] as unknown as {person:unknown}).person={salary:100};
 assert.throws(()=>buildReport(snapshot,reportOptions(new URL('https://lab.test?report=team-schedule'))));
});
