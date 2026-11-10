const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness(){
 const states=[],effects=[],memos=[];let index=0,pending=[],tree,gets=0,posts=[],fail=false,duplicates=0;
 const rows=[{itemId:'a',revision:1,name:'Plywood 10',unit:'sheet',unitCost:100,source:'Google Sheet DB'},{itemId:'b',revision:1,name:'Plywood 2',unit:'sheet',unitCost:20,source:'Added from Takeoff'}];
 const same=(a,b)=>a&&b&&a.length===b.length&&a.every((x,i)=>Object.is(x,b[i]));
 const react={useRef(value){const i=index++;return states[i]??={current:value}},useState(value){const i=index++;if(!(i in states))states[i]=typeof value==='function'?value():value;return [states[i],v=>states[i]=typeof v==='function'?v(states[i]):v]},useCallback(fn,deps){return react.useMemo(()=>fn,deps)},useMemo(fn,deps){const i=index++;if(!memos[i]||!same(memos[i].deps,deps))memos[i]={deps,value:fn()};return memos[i].value},useEffect(fn,deps){const i=index++;if(!effects[i]||!same(effects[i].deps,deps))pending.push(()=>{effects[i]?.cleanup?.();effects[i]={deps,cleanup:fn()}})}};
 const jsx=(type,props)=>({type,props});const window=new EventTarget();let events=0;window.addEventListener('tracker-catalog-changed',()=>events++);
 const imports={react,'react/jsx-runtime':{jsx,jsxs:jsx},'@/lib/catalog-review':{catalogDuplicatePlan:()=>{duplicates++;return []}},'@/lib/tracker-catalog':{},'./confirm-action':{confirmAction:async()=>true},'./catalog-price-history':{},'@/lib/ada-client':{adaFetch:async(_url,options)=>{
 if(options.method!=='POST'){gets++;return Response.json({entries:rows,ready:true,initialized:true,canEdit:true,warnings:[]})}
 const body=JSON.parse(options.body);posts.push(body);if(fail)return Response.json({error:'Catalog changed'}, {status:409});return Response.json({material:{...rows.find(r=>r.itemId===body.itemId),name:body.name,unit:body.unit,unitCost:body.unitCost+1,revision:body.expectedVersion+1}});
 }}};
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/tracker-catalog.tsx','utf8'),{compilerOptions:{jsx:ts.JsxEmit.ReactJSX,module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{module,exports:module.exports,require:n=>imports[n],window,Event,Response,Intl,Number});
 const render=()=>{index=0;tree=module.exports.TrackerCatalog();const work=pending;pending=[];work.forEach(f=>f())};
 const nodes=()=>{const out=[];function visit(x){if(!x)return;if(Array.isArray(x)){x.forEach(visit);return}if(typeof x==='object'){out.push(x);visit(x.props?.children)}}visit(tree);return out};
 return {render,settle:async()=>{await new Promise(r=>setImmediate(r));render()},nodes,find:label=>nodes().find(n=>n.props?.['aria-label']===label),form:()=>nodes().find(n=>n.type==='form'),body:()=>nodes().find(n=>n.type==='tbody'),gets:()=>gets,posts:()=>posts,duplicates:()=>duplicates,events:()=>events,fail:()=>fail=true};
}
test('search/sort retain natural ordering without re-running duplicate review; editing does not rebuild rows',async()=>{
 const h=harness();h.render();await h.settle();const duplicateCalls=h.duplicates();
 assert.match(JSON.stringify(h.body()),/Plywood 2.*Plywood 10/);
 h.find('Search Tracker catalog').props.onChange({target:{value:'Plywood 10'}});h.render();assert.equal(h.duplicates(),duplicateCalls);assert.equal(h.find('Edit catalog entry Plywood 2'),undefined);
 const before=h.body().props.children;h.find('Edit catalog entry Plywood 10').props.onClick();h.render();const cost=h.nodes().find(n=>n.type==='input'&&n.props.type==='number');cost.props.onChange({target:{value:'125'}});h.render();assert.equal(h.body().props.children,before);assert.equal(h.duplicates(),duplicateCalls);
 h.find('Search Tracker catalog').props.onChange({target:{value:''}});h.render();const unitCost=h.nodes().find(n=>n.type==='button'&&Array.isArray(n.props.children)&&n.props.children[0]==='Unit cost');unitCost.props.onClick();h.render();assert.match(JSON.stringify(h.body()),/Plywood 2.*Plywood 10/);
});
test('price save uses authoritative response/revision without reloading catalog and notifies consumers',async()=>{
 const h=harness();h.render();await h.settle();h.find('Edit catalog entry Plywood 10').props.onClick();h.render();h.nodes().find(n=>n.type==='input'&&n.props.type==='number').props.onChange({target:{value:'125'}});h.render();
 h.form().props.onSubmit({preventDefault(){}});h.form().props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.posts().length,1);assert.equal(h.gets(),1);assert.equal(h.events(),1);assert.match(JSON.stringify(h.body()),/\$126.00/);assert.equal(h.form(),undefined);
 h.find('Edit catalog entry Plywood 10').props.onClick();h.render();h.form().props.onSubmit({preventDefault(){}});await h.settle();assert.equal(h.posts()[1].expectedVersion,2);
});
test('conflict preserves unsaved edit and leaves current catalog price unchanged',async()=>{
 const h=harness();h.render();await h.settle();h.fail();h.find('Edit catalog entry Plywood 10').props.onClick();h.render();h.form().props.onSubmit({preventDefault(){}});await h.settle();assert.ok(h.form());assert.match(JSON.stringify(h.body()),/\$100.00/);assert.equal(h.events(),0);assert.equal(h.gets(),1);assert.ok(h.nodes().some(n=>n.props?.role==='alert'&&n.props.children==='Catalog changed'));
});
