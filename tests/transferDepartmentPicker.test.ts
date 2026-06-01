import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('transfer request uses requester department instead of manual department picker', () => {
  const source = readFileSync('src/pages/Transfers.tsx', 'utf8');

  assert.doesNotMatch(source, /<datalist\b/);
  assert.doesNotMatch(source, /list="transfer-depts"/);
  assert.match(source, /transfer-to-department/);
  assert.match(source, /Khoa yêu cầu mượn/);
  assert.match(source, /value={userDepartment}/);
  assert.doesNotMatch(source, /Nhập hoặc chọn khoa\/phòng nhận/);
});
