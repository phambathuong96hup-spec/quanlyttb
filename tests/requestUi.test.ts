import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const readIfExists = (path: string) => existsSync(path) ? readFileSync(path, 'utf8') : '';

test('request workflows share a unified shell with distinct task variants', () => {
  const requestsSource = readFileSync('src/pages/Requests.tsx', 'utf8');
  const repairSource = readFileSync('src/pages/RepairRequest.tsx', 'utf8');
  const transfersSource = readFileSync('src/pages/Transfers.tsx', 'utf8');
  const requestsCss = readIfExists('src/pages/Requests.css');

  assert.match(requestsSource, /import\s+['"]\.\/Requests\.css['"]/);
  assert.match(requestsSource, /request-hub/);
  assert.match(repairSource, /request-workspace-repair/);
  assert.match(repairSource, /request-summary-repair/);
  assert.match(transfersSource, /request-workspace-transfer/);
  assert.match(transfersSource, /request-summary-transfer/);
  assert.match(requestsCss, /\.request-workspace-repair/);
  assert.match(requestsCss, /\.request-workspace-transfer/);
});
