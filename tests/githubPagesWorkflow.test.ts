import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('GitHub Pages workflow builds Vite app for the repository subpath', () => {
  const workflow = readFileSync('.github/workflows/deploy-pages.yml', 'utf8');

  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run build/);
  assert.match(workflow, /VITE_BASE_PATH:\s*\/quanlyttb\//);
  assert.match(workflow, /cp dist\/index\.html dist\/404\.html/);
  assert.match(workflow, /actions\/upload-pages-artifact@v3/);
  assert.match(workflow, /actions\/deploy-pages@v4/);
});
