import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('transfer department picker uses inline suggestions instead of native datalist', () => {
  const source = readFileSync('src/pages/Transfers.tsx', 'utf8');
  const css = readFileSync('src/pages/Requests.css', 'utf8');

  assert.doesNotMatch(source, /<datalist\b/);
  assert.doesNotMatch(source, /list="transfer-depts"/);
  assert.match(source, /transfer-department-options/);
  assert.match(source, /transfer-to-department/);
  assert.match(css, /\.transfer-department-options/);
});
