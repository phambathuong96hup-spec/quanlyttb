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

test('operations page removes repair SLA reporting but keeps cost tracking', () => {
  const source = readFileSync('src/pages/Operations.tsx', 'utf8');
  const utils = readFileSync('src/utils/operationalInsights.ts', 'utf8');
  const css = readFileSync('src/pages/Operations.css', 'utf8');

  assert.doesNotMatch(source, /Báo cáo SLA sửa chữa/);
  assert.doesNotMatch(source, /SLA & chi phí/);
  assert.doesNotMatch(source, /buildSlaSummary/);
  assert.doesNotMatch(source, /getRepairAgeDays/);
  assert.doesNotMatch(source, /slaSummary/);
  assert.doesNotMatch(utils, /interface SlaSummary/);
  assert.doesNotMatch(utils, /buildSlaSummary/);
  assert.doesNotMatch(utils, /getRepairAgeDays/);
  assert.doesNotMatch(css, /ops-sla-grid/);
  assert.match(source, /id: 'costs'/);
  assert.match(source, /label: 'Chi phí'/);
  assert.match(source, /renderCostsTab/);
  assert.match(source, /Chi phí sửa chữa\/bảo trì/);
});
