import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

test('inventory lookup rejects partial and ambiguous device identifiers', () => {
  const page = readFileSync('src/pages/InventoryQr.tsx', 'utf8');
  const source = page.slice(page.indexOf('const cleanText ='), page.indexOf('const formatDateTime ='));
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  const match = new Function(code + '; return matchDeviceByCode;')();
  const devices = [{ id: 'TB-001', serial: 'DUP' }, { id: 'TB-002', serial: 'DUP' }];
  assert.equal(match(devices, 'TB-00'), null);
  assert.equal(match(devices, 'DUP'), null);
  assert.equal(match(devices, 'https://example.test/devices/TB-002'), devices[1]);
  const grouped = [{ id: 'A; B', serial: 'GROUP-1' }];
  assert.equal(match(grouped, 'A; B'), grouped[0]);
  assert.equal(match(grouped, 'B'), grouped[0]);
});
