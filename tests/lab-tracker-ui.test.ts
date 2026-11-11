import test from 'node:test';
import assert from 'node:assert/strict';
import {usesTrackerV2Ui,findSectionForPath} from '../src/lib/lab-tracker-ui';
import {healthMoney,quotedWorkHours} from '../src/lib/lab-project-presentation';
import {directoryProject} from '../src/lib/lab-project-directory';
test('quote and capacity workspaces retain the original experience at every nested route',()=>{
 for(const path of ['/quotes','/quotes/archived','/quotes/import','/quotes/catalog','/quotes/settings','/quotes/workspace','/capacity','/capacity/guidebook','/capacity/workspace','/ada','/ada/workspace','/login'])assert.equal(usesTrackerV2Ui(path),false,path);
 for(const path of ['/','/projects','/projects/26218','/expenses','/find','/line-item-search','/prequote-items','/admin/users','/admin/materials'])assert.equal(usesTrackerV2Ui(path),true,path);
 assert.equal(findSectionForPath('/admin/materials/123'),'materials');assert.equal(findSectionForPath('/quotes/catalog'),null);assert.equal(findSectionForPath('/prequote-items/123'),'quoted-items');
});
test('Overview uses the same known subtotal while unknown costs and remaining budget stay unavailable',()=>{
 assert.deepEqual(healthMoney(100,null),{cost:null,percent:null,remaining:null,incomplete:true});
 assert.deepEqual(healthMoney(100,{expenses:40,knownCost:10,complete:false}),{cost:50,percent:50,remaining:null,incomplete:true});
 assert.equal(healthMoney(100,{expenses:150,knownCost:10,complete:true}).percent,160);
 assert.equal(healthMoney(0,{expenses:0,knownCost:0,complete:true}).percent,null);
});
test('Overview and Budget Detail use identical quote work categories, not production allocation percentages',()=>{
 assert.deepEqual(quotedWorkHours([{type:'Fabrication',hoursAllowed:279},{type:'Design / Engineering / CAD',hoursAllowed:24},{type:'Installer Days',hoursAllowed:20}]),{shop:279,design:24,install:20,dismantle:0,unclassified:0});
});
test('directory distinguishes unimported actuals and refuses a mismatched capture',()=>{
 const source={projects:{id:'job',job_number:'123',hubspot_deal_id:'456'},workbook_revision:22,snapshot:{totals:{price:120,buildBudget:100,hoursAllowed:5}}};
 const unknown=directoryProject(source,null);assert.equal(unknown.cost,null);assert.equal(unknown.percent,null);assert.equal(unknown.activityState,'not-imported');
 const mismatch=directoryProject(source,{job_number:'999',hubspot_deal_id:'456'});assert.equal(mismatch.activityState,'link-changed');assert.equal(mismatch.cost,null);
});
