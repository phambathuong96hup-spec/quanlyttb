import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('toast provider and hooks import from the toast module directly', () => {
  const appSource = readFileSync('src/App.tsx', 'utf8');
  const topNavSource = readFileSync('src/components/layout/TopNav.tsx', 'utf8');

  assert.match(
    appSource,
    /import\s+\{\s*ToastProvider\s*\}\s+from\s+['"]\.\/components\/ui\/Toast['"]/,
  );
  assert.match(
    topNavSource,
    /import\s+\{\s*useToast\s*\}\s+from\s+['"]\.\.\/ui\/Toast['"]/,
  );
});
