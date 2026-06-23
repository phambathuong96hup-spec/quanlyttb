import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('lint ignores generated, dependency, and vendored source trees', () => {
  const config = readFileSync('eslint.config.js', 'utf8');

  assert.match(config, /globalIgnores\(\[[\s\S]*['"]dist['"]/);
  assert.match(config, /globalIgnores\(\[[\s\S]*['"]node_modules['"]/);
  assert.match(config, /globalIgnores\(\[[\s\S]*['"]LightRAG-main['"]/);
  assert.match(config, /globalIgnores\(\[[\s\S]*['"]tmp['"]/);
});
