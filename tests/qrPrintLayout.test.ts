import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('bulk QR print layout uses fixed grid cards with non-overflowing labels', () => {
  const source = readFileSync('src/pages/DeviceList.tsx', 'utf8');
  const css = readFileSync('src/pages/Devices.css', 'utf8');

  assert.match(source, /print-qr-card/);
  assert.match(source, /print-qr-code-list/);
  assert.match(source, /print-qr-hidden-count/);
  assert.match(source, /print-qr-name/);
  assert.match(source, /print-qr-department/);
  assert.match(css, /#print-area\s*\{[\s\S]*display:\s*grid/);
  assert.match(css, /grid-template-columns:\s*repeat\(3,\s*58mm\)/);
  assert.match(css, /\.print-qr-card\s*\{[\s\S]*box-sizing:\s*border-box/);
  assert.match(css, /\.print-qr-code-list\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
  assert.match(css, /\.print-qr-name\s*\{[\s\S]*-webkit-line-clamp:\s*2/);
  assert.match(css, /\.print-qr-department\s*\{[\s\S]*-webkit-line-clamp:\s*1/);
});

test('operations QR workspace uses balanced columns and wraps long URLs', () => {
  const source = readFileSync('src/pages/Operations.tsx', 'utf8');
  const css = readFileSync('src/pages/Operations.css', 'utf8');

  assert.match(source, /ops-qr-workspace/);
  assert.match(source, /ops-qr-card/);
  assert.match(source, /ops-qr-meta/);
  assert.match(css, /\.ops-qr-workspace\s*\{[\s\S]*grid-template-columns:\s*minmax\(180px,\s*220px\)\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.ops-qr-info code\s*\{[\s\S]*overflow-wrap:\s*anywhere/);
});
