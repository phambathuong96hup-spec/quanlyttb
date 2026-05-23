import assert from 'node:assert/strict';
import { test } from 'node:test';
import { getAssignableDepartments } from '../src/utils/departmentUtils.ts';

test('assignable departments exclude unallocated placeholders but keep real departments', () => {
  const departments = [
    '',
    'Chưa phân bổ',
    'Chua phan bo',
    'Không rõ',
    'Khoa Nhi',
    'Khoa Dược, vật tư, TBYT',
    'Khoa Nhi',
  ];

  assert.deepEqual(getAssignableDepartments(departments), [
    'Khoa Dược, vật tư, TBYT',
    'Khoa Nhi',
  ]);
});
