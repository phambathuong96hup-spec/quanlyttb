import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';

test('GitHub Pages workflow builds Vite app for the repository subpath', () => {
  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');

  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /VITE_BASE_PATH:\s*\/quanlyttb\//);
  assert.match(workflow, /VITE_AI_API_URL:\s*https:\/\/pbthuong-ai\.hf\.space/);
  assert.match(workflow, /cp dist\/index\.html dist\/404\.html/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});

test('GitHub Pages deployment is strictly gated behind verification and build jobs', () => {
  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');

  // Verify jobs exist with dependencies
  assert.match(workflow, /verify:\s*\n\s*runs-on:\s*ubuntu-latest/);
  assert.match(workflow, /build:\s*\n\s*runs-on:\s*ubuntu-latest\s*\n\s*needs:\s*verify/);
  assert.match(workflow, /deploy:\s*[\s\S]*?needs:\s*build/);

  // Verify verification steps include all quality checks
  assert.match(workflow, /npm run lint/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /npm run test:e2e/);

  // Verify no continue-on-error
  assert.doesNotMatch(workflow, /continue-on-error:\s*true/);

  // Verify failure artifacts uploaded
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /if:\s*failure\(\)/);
});

test('Quality workflow uploads test artifacts on failure and forbids continue-on-error', () => {
  const quality = readFileSync('.github/workflows/quality.yml', 'utf8');

  assert.match(quality, /actions\/upload-artifact@v4/);
  assert.match(quality, /if:\s*failure\(\)/);
  assert.doesNotMatch(quality, /continue-on-error:\s*true/);
});

test('GitHub Pages does not deploy the raw repository source', () => {
  assert.equal(existsSync('.github/workflows/static.yml'), false);
});
