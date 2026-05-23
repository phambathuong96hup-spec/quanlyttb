import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('Apps Script email notifications include evidence links and admin recipients', () => {
  const source = readFileSync('gas/Code.gs', 'utf8');

  assert.match(source, /function adminEmails_/);
  assert.match(source, /function evidenceLinkRow_/);
  assert.match(source, /recipients\s*=\s*recipients\.concat\(adminEmails_\(\)\)/);
  assert.match(source, /evidenceLinkRow_\('Ảnh minh chứng', imageUrl\)/);
  assert.match(source, /evidenceLinkRow_\('Ảnh hoàn thành\/xử lý', imageUrl\)/);
  assert.match(source, /evidenceUrl:\s*imageUrl/);
  assert.match(source, /type:\s*'cancelled'/);
  assert.match(source, /Đã hủy yêu cầu luân chuyển thiết bị/);
});
