import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ui = path.join(process.cwd(), 'src', 'components', 'ui');

test('shared dialogs and alerts fit the viewport and scroll internally', () => {
  const dialog = readFileSync(path.join(ui, 'dialog.tsx'), 'utf8');
  const alertDialog = readFileSync(path.join(ui, 'alert-dialog.tsx'), 'utf8');

  assert.match(dialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(dialog, /overflow-y-auto/);
  assert.match(alertDialog, /max-h-\[calc\(100dvh-2rem\)\]/);
  assert.match(alertDialog, /overflow-y-auto/);
});

test('shared select trigger can shrink inside responsive forms', () => {
  const select = readFileSync(path.join(ui, 'select.tsx'), 'utf8');

  assert.match(select, /w-full/);
  assert.match(select, /min-w-0/);
  assert.doesNotMatch(select, /flex w-fit/);
  assert.match(select, /whitespace-normal/);
});
