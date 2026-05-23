import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('operations summary cards omit low-signal document and critical-risk counters', () => {
  const source = readFileSync('src/pages/Operations.tsx', 'utf8');
  const css = readFileSync('src/pages/Operations.css', 'utf8');

  assert.doesNotMatch(source, /<span>Thiếu hồ sơ<\/span>/);
  assert.doesNotMatch(source, /<span>Thiết bị rủi ro rất cao<\/span>/);
  assert.doesNotMatch(source, /buildRiskScores/);
  assert.doesNotMatch(source, /renderRiskTab/);
  assert.doesNotMatch(source, /id: 'risk'/);
  assert.doesNotMatch(source, /Chấm điểm rủi ro/);
  assert.doesNotMatch(source, /Rủi ro/);
  assert.doesNotMatch(css, /ops-risk-score/);
});
