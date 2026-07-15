import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('CI runs static checks, unit tests, build, and Playwright smoke tests', () => {
  const workflowPath = '.github/workflows/quality.yml';
  assert.equal(existsSync(workflowPath), true, 'quality workflow must exist');

  const workflow = readFileSync(workflowPath, 'utf8');
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /npx playwright install --with-deps chromium/);
  assert.match(workflow, /npm run test:e2e/);
});
