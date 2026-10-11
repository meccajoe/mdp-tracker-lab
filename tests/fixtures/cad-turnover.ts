import {createBlankQuoteV27} from '../../src/lib/quote-v27-template';
import {emptyEstimators} from '../../src/lib/quote-v27-estimators';
import type {Takeoff} from '../../src/lib/quote-v27';
/** Illustrative quantities supplied by Paul, not a saved business quote. */
export function cadFixture(){
  const q=createBlankQuoteV27();q.estimators=emptyEstimators();q.lines=q.lines.slice(0,3);
  q.lines[0].name='Golden Arch';q.lines[1].name='Left Wall';q.lines[1].type='beMatrix / SEG';q.lines[2].name='Round Retail Display';
  q.lines.forEach(l=>l.takeoffDriven=true);
  q.catalog=[];q.trades=[{id:'carpentry',name:'Carpentry',wage:28}];
  function row(id:string,line:number,description:string,quantity:number,unit:string,hours=0,notes='',sections:number|null=null):Takeoff{
    return {id,lineId:q.lines[line].id,description,quantity,unit,hours,notes,sections,materialId:null,tradeId:hours?'carpentry':null,unitCostOverride:quantity?10:0,resale:false};
  }
  q.takeoffs=[row('ply',0,'¾” plywood',7,'sheet',0,'',2),row('acm',0,'ACM panel',6,'panel'),row('paint',0,'Paint',1,'allowance',0,'Paint finish; color to be confirmed.'),row('labor',0,'Carpentry',0,'hours',40),row('display-ply',2,'Plywood',16,'sheet'),row('bender',2,'¼” bender board',4,'sheet'),row('laminate',2,'Laminate',7,'sheet'),row('display-labor',2,'Carpentry',0,'hours',32)];
  q.estimators!.beMatrix.walls=[{id:'wall',lineId:q.lines[1].id,width:22.75,height:8,sides:2,sqftOverride:null}];
  q.schedule={buildStart:'2026-10-19',buildFinish:'2026-10-23',installDate:'2026-10-26',status:'Likely'};
  return q;
}
