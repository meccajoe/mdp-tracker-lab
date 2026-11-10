const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness(){
 const states=[],effects=[],memos=[];let index=0,pending=[],tree,gets=0,fail=false,hold=false,release;
 const window=new EventTarget(),row={id:'one',title:'Example',capacity_group:'group',capacity_selected:true,capacity_version:1,created_at:'2026-11-01',last_modified:'2026-11-01',quote_status:'draft',status_version:1,workbook_revision:1,forecast_status:'Possible',project_status:'Not Active',quote_total:123};
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const react={Fragment:'fragment',useRef(value){const i=index++;return states[i]??=( {current:value});},useState(value){const i=index++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],v=>{states[i]=typeof v==='function'?v(states[i]):v}];},useCallback(fn,deps){return react.useMemo(()=>fn,deps)},useMemo(fn,deps){const i=index++;if(!memos[i]||!same(memos[i].deps,deps))memos[i]={deps,value:fn()};return memos[i].value},useEffect(fn,deps){const i=index++;if(!effects[i]||!same(effects[i].deps,deps)){pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}})}}};
 const jsx=(type,props)=>({type,props});
 let groupCalls=0;
 const imports={react,'react/jsx-runtime':{jsx,jsxs:jsx},'next/navigation':{useRouter:()=>({push(){}})},'@/lib/quote-version-groups':{groupQuoteVersions:(rows,matches)=>{groupCalls++;return rows.filter(matches).map(primary=>({id:primary.id,primary,others:[{...primary,id:'older',title:'Example v1'}]}))}},'@/lib/quote-schedule':{forecastLabel:x=>x,SALES_FORECAST_STATUSES:['Possible','Likely'],PROJECT_STATUSES:['Not Active','Active','Complete']},'@/lib/quote-library-client':{invalidateQuoteLibrary:source=>window.dispatchEvent(new CustomEvent('quote-workbook-saved',{detail:{source}}))},'@/lib/ada-client':{adaFetch:async(url,options)=>{
 if(!options){gets++;if(hold)await new Promise(r=>release=r);return Response.json({workspaces:[row],managementReady:true,hasMore:false});}
 if(fail)return Response.json({error:'Conflict'}, {status:409});return Response.json({status:'final',version:2});
 }}};
 const module={exports:{}};
 const source=ts.transpileModule(fs.readFileSync('src/components/quote-library.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 vm.runInNewContext(source,{module,exports:module.exports,require:n=>imports[n]??new Proxy({},{get:(_,key)=>String(key)}),window,Event,CustomEvent,Response,crypto,Set,Map,Intl,Date});
 const render=()=>{index=0;tree=module.exports.QuoteLibrary({});const work=pending;pending=[];work.forEach(f=>f());return tree;};
 const nodes=()=>{const out=[];function visit(x){if(!x)return;if(Array.isArray(x)){x.forEach(visit);return;}if(typeof x==='object'){out.push(x);visit(x.props?.children)}}visit(tree);return out};
 return {render,find:label=>nodes().find(n=>n.props?.['aria-label']===label),text:()=>JSON.stringify(tree),settle:async()=>{await new Promise(r=>setImmediate(r));render()},gets:()=>gets,groups:()=>groupCalls,window,fail:()=>fail=true,hold:()=>hold=true,release:()=>{hold=false;release()},row};
}
test('status update stays in place without self-triggering a full list reload; external refresh still loads',async()=>{
 const h=harness();h.render();await h.settle();assert.equal(h.gets(),1);
 h.find('Quote Status · Example').props.onChange({target:{value:'final'}});await h.settle();
 assert.equal(h.gets(),1);assert.equal(h.find('Quote Status · Example').props.value,'final');
 h.hold();h.window.dispatchEvent(new Event('quote-workbook-saved'));h.render();assert.equal(h.gets(),2);assert.ok(h.find('Quote Status · Example'));assert.match(h.text(),/Refreshing quotes/);
 h.release();await h.settle();
});
test('failed optimistic status rolls back and reloads authoritative state',async()=>{
 const h=harness();h.render();await h.settle();h.fail();h.find('Quote Status · Example').props.onChange({target:{value:'final'}});await h.settle();
 assert.equal(h.gets(),2);assert.equal(h.find('Quote Status · Example').props.value,'draft');assert.match(h.text(),/Conflict/);
});
test('selection rerenders reuse grouping and identity changes clear old rows while loading',async()=>{
 const h=harness();h.render();await h.settle();const groups=h.groups();h.find('Select Example').props.onChange({target:{checked:true}});h.render();assert.equal(h.groups(),groups);
 h.hold();h.window.dispatchEvent(new Event('quote-library-identity-changed'));h.render();assert.equal(h.find('Quote Status · Example'),undefined);h.release();await h.settle();
});

test('group expansion reveals loaded older versions without requests or regrouping',async()=>{
 const h=harness();h.render();await h.settle();const groups=h.groups();assert.equal(h.find('Quote Status · Example v1'),undefined);
 h.find('Other versions of Example').props.onClick();h.render();assert.ok(h.find('Quote Status · Example v1'));assert.equal(h.gets(),1);assert.equal(h.groups(),groups);
 h.find('Other versions of Example').props.onClick();h.render();assert.equal(h.find('Quote Status · Example v1'),undefined);
});

test('linked quotes expose job identity and job-number search without dropping the existing status controls',async()=>{
 const h=harness();h.row.job_number='26223';h.row.tracker_project_id='job';h.render();await h.settle();
 assert.match(h.text(),/Job number/);assert.match(h.text(),/26223/);assert.match(h.text(),/Refresh from HubSpot/);
 h.find('Search quotes').props.onChange({target:{value:'26223'}});h.render();assert.ok(h.find('Quote Status · Example'));
 h.find('Search quotes').props.onChange({target:{value:'no matching job'}});h.render();assert.equal(h.find('Quote Status · Example'),undefined);assert.match(h.text(),/No quotes found/);
});
