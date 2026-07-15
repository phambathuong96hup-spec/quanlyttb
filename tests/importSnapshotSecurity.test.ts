import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('snapshot import never ships fallback credentials and requires explicit secrets', () => {
  const source = readFileSync('scripts/importSnapshotToGas.mjs', 'utf8');

  assert.doesNotMatch(source, /DEFAULT_(?:USERNAME|PIN)/);
  assert.doesNotMatch(source, /const username\s*=.*\|\|\s*['"][^'"]+['"]/);
  assert.doesNotMatch(source, /const pin\s*=.*\|\|\s*['"][^'"]+['"]/);
  assert.match(source, /if \(!username \|\| !pin\)/);
  assert.match(source, /QLTTB_IMPORT_USERNAME/);
  assert.match(source, /QLTTB_IMPORT_PIN/);
});
