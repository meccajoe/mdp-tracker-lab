import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const source = fs.readFileSync(new URL('../src/app/admin/data-entry/page.tsx', import.meta.url), 'utf8');

test('L&M header explains it is based on fabrication subtotal, not contract amount', () => {
  assert.match(source, /Labor &amp; Materials <span className="normal-case font-normal">\(% of fabrication subtotal\)<\/span>/);
  assert.match(source, /<span>% of Fabrication<\/span>/);
});

test('override buttons seed manual mode even when the formula result is null or zero', () => {
  assert.match(source, /setBudgetOverrides\(\(prev\) => \(\{ \.\.\.prev, \[catKey\]: formulaValue != null \? String\(formulaValue\) : "0" \}\)\)/);
  assert.match(source, /setBudgetOverrides\(\(prev\) => \(\{ \.\.\.prev, \[cat\.key\]: formulaResult != null \? String\(formulaResult\) : "0" \}\)\)/);
});
