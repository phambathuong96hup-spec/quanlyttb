import assert from 'node:assert/strict';
import test from 'node:test';
import type { DeviceData } from '../src/services/api.ts';
import {
  buildTransferRecommendations,
  getTransferStockGuardViolation,
} from '../src/utils/transferRecommendations.ts';

const device = (overrides: Partial<DeviceData>): DeviceData => ({
  id: 'TB-001',
  name: 'Máy monitor',
  department: 'Khoa Nội',
  status: 'Đang sử dụng',
  dateAdded: '01/01/2025',
  group: 'MONITOR',
  ...overrides,
});

test('transfer recommendations keep at least one same-type device in HSCC and Nhi', () => {
  const recommendations = buildTransferRecommendations({
    devices: [
      device({ id: 'HSCC-ONLY', department: 'Khoa Cấp cứu - Hồi sức tích cực - Chống độc và Thận lọc máu' }),
      device({ id: 'NHI-ONLY', department: 'Khoa Nhi' }),
      device({ id: 'NOI-OK', department: 'Khoa Nội tổng hợp - Truyền nhiễm - Lão khoa' }),
    ],
    targetDepartment: 'Khoa Ngoại',
    requestedDeviceId: 'NHI-ONLY',
  });

  assert.deepEqual(recommendations.map(item => item.device.id), ['NOI-OK']);
  assert.equal(recommendations[0].guardedDepartment, undefined);
});

test('transfer recommendations allow HSCC or Nhi source when same type has stock above one', () => {
  const recommendations = buildTransferRecommendations({
    devices: [
      device({ id: 'HSCC-1', department: 'Khoa Cấp cứu - Hồi sức tích cực - Chống độc và Thận lọc máu' }),
      device({ id: 'HSCC-2', department: 'Khoa Cấp cứu - Hồi sức tích cực - Chống độc và Thận lọc máu' }),
      device({ id: 'NHI-1', department: 'Khoa Nhi' }),
      device({ id: 'NHI-2', department: 'Khoa Nhi' }),
    ],
    targetDepartment: 'Khoa Ngoại',
    requestedDeviceId: 'HSCC-1',
  });

  assert.deepEqual(recommendations.map(item => item.device.id), ['HSCC-1', 'HSCC-2', 'NHI-1', 'NHI-2']);
  assert.equal(recommendations[0].remainingInSource, 1);
});

test('transfer recommendations match same type from requested device name when group is absent', () => {
  const recommendations = buildTransferRecommendations({
    devices: [
      device({ id: 'REQ', name: 'Bơm tiêm điện', group: '', department: 'Khoa Ngoại' }),
      device({ id: 'MATCH', name: 'Bơm tiêm điện', group: '', department: 'Khoa Nội' }),
      device({ id: 'OTHER', name: 'Máy monitor', group: '', department: 'Khoa Nội' }),
    ],
    targetDepartment: 'Khoa Ngoại',
    requestedDeviceId: 'REQ',
  });

  assert.deepEqual(recommendations.map(item => item.device.id), ['MATCH']);
});

test('stock guard blocks moving the last same-type device out of HSCC or Nhi', () => {
  const violation = getTransferStockGuardViolation({
    devices: [
      device({ id: 'NHI-ONLY', department: 'Khoa Nhi', name: 'Máy monitor' }),
      device({ id: 'NOI-OK', department: 'Khoa Nội', name: 'Máy monitor' }),
    ],
    selectedDeviceId: 'NHI-ONLY',
    targetDepartment: 'Khoa Ngoại',
  });

  assert.deepEqual(violation, {
    department: 'Nhi',
    deviceType: 'Máy monitor',
  });
});

test('stock guard allows moving within the same guarded department', () => {
  const violation = getTransferStockGuardViolation({
    devices: [
      device({ id: 'NHI-ONLY', department: 'Khoa Nhi', name: 'Máy monitor' }),
    ],
    selectedDeviceId: 'NHI-ONLY',
    targetDepartment: 'Khoa Nhi',
  });

  assert.equal(violation, null);
});
