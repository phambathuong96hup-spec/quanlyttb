import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('non-admin profile edits can change only their PIN, not authorization identity fields', () => {
  const topNav = readFileSync('src/components/layout/TopNav.tsx', 'utf8');

  assert.match(topNav, /fullName:\s*isAdmin\s*\?\s*editName\.trim\(\)\s*:\s*undefined/);
  assert.match(topNav, /email:\s*isAdmin\s*\?\s*editEmail\.trim\(\)\s*:\s*undefined/);
  assert.match(topNav, /department:\s*isAdmin\s*\?\s*editDept\.trim\(\)\s*:\s*undefined/);
  assert.ok((topNav.match(/disabled=\{isSaving\s*\|\|\s*!isAdmin\}/g) || []).length >= 3);
  assert.match(topNav, /Thông tin hồ sơ chỉ do quản trị viên cập nhật/);
});
