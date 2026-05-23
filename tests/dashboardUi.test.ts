import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('dashboard overview uses the modern operations layout classes', () => {
  const source = readFileSync('src/pages/Dashboard.tsx', 'utf8');
  const css = readFileSync('src/pages/Dashboard.css', 'utf8');

  assert.match(source, /dashboard-hero/);
  assert.match(source, /dashboard-kpi-grid/);
  assert.match(source, /dashboard-analytics-grid/);
  assert.match(source, /dashboard-work-grid/);
  assert.match(source, /stat-meta/);
  assert.match(source, /alert-level-dot/);

  assert.match(css, /\.dashboard-hero/);
  assert.match(css, /\.dashboard-kpi-grid/);
  assert.match(css, /\.dashboard-panel/);
  assert.match(css, /\.alert-group-critical/);
});
