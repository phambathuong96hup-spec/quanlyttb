import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const apiEndpoint = 'https://script.google.com/macros/s/AKfycbwk_NI8tmQlxTcMLC0J6D8SN63sI7rEgj726h6GSTKqvYOTCtMhNb7gkqkkEOlZu-AU5g/exec';
const oldEndpoints = [
  'https://script.google.com/macros/s/AKfycbyGRPHQeuLhVCC2fOVMJs3WTzlzrah4U8sm9dAHGaKOEqfbNGQXiXp6MebNewou3m5akg/exec',
  'https://script.google.com/macros/s/AKfycbyCO90Djk3BPY4zWH38cGixm1GkoBXMQezrZPisgfOzEvoCMVHSSOKqEvYrWlMcKM1IEw/exec',
];

test('default Apps Script endpoint is updated consistently', () => {
  const apiSource = readFileSync('src/services/api.ts', 'utf8');
  const importScript = readFileSync('scripts/importSnapshotToGas.mjs', 'utf8');

  assert.match(apiSource, new RegExp(apiEndpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(importScript, new RegExp(apiEndpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  oldEndpoints.forEach((oldEndpoint) => {
    assert.doesNotMatch(apiSource, new RegExp(oldEndpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.doesNotMatch(importScript, new RegExp(oldEndpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
});

test('local env files do not override the default Apps Script endpoint', () => {
  ['.env.local', '.env.production'].forEach((envFile) => {
    if (!existsSync(envFile)) return;

    const envSource = readFileSync(envFile, 'utf8');

    assert.doesNotMatch(envSource, /^VITE_THIET_BI_API_URL=/m);
  });
});
