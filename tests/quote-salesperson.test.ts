import test from 'node:test';
import assert from 'node:assert/strict';
import {matchesSalesperson,quoteSalesperson,salespersonOptions} from '../src/lib/quote-salesperson';
import {groupQuoteVersions} from '../src/lib/quote-version-groups';
test('salesperson filter distinguishes unassigned, exact names and custom names',()=>{
 assert.equal(quoteSalesperson(null),'');assert.equal(quoteSalesperson(' Maria Mecca '),'Maria Mecca');
 assert.ok(matchesSalesperson(undefined,'unassigned'));assert.ok(matchesSalesperson('','all'));
 assert.ok(matchesSalesperson('Paul Mecca','person:Paul Mecca'));assert.equal(matchesSalesperson('Maria Mecca','person:Paul Mecca'),false);
 assert.ok(matchesSalesperson('Outside Sales','person:Outside Sales'));
 const options=salespersonOptions([' Maria Mecca ','Outside Sales',null,'Outside Sales']);assert.equal(options.filter(x=>x==='Maria Mecca').length,1);assert.ok(options.includes('Outside Sales'));assert.equal(options.includes(''),false);
});
test('salesperson matches older grouped versions and sorting retains newest primary',()=>{
 const rows=[{id:'old',capacity_group:'g',capacity_selected:false,created_at:'2026-01-01',salesperson:'Paul Mecca'},{id:'new',capacity_group:'g',capacity_selected:true,created_at:'2026-02-01',salesperson:'Maria Mecca'},{id:'other',capacity_group:'h',capacity_selected:true,created_at:'2026-01-01',salesperson:'Carlos Chaidez'}];
 const groups=groupQuoteVersions(rows,w=>matchesSalesperson(w.salesperson,'person:Paul Mecca'),(a,b)=>a.salesperson.localeCompare(b.salesperson));assert.equal(groups.length,1);assert.equal(groups[0].primary.id,'new');assert.equal(groups[0].others[0].id,'old');
 const sorted=groupQuoteVersions(rows,()=>true,(a,b)=>a.salesperson.localeCompare(b.salesperson));assert.equal(sorted[0].primary.salesperson,'Carlos Chaidez');
});
