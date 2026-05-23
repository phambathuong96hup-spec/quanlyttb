import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getDeviceStatusFlags,
  matchesDeviceStatusFilter,
  resolveDeviceListStatus,
} from '../src/utils/deviceStatus.ts';
import type { DeviceData } from '../src/services/api.ts';

const today = new Date('2026-05-23T00:00:00+07:00');

const makeDevice = (overrides: Partial<DeviceData>): DeviceData => ({
  id: 'TB-001',
  name: 'May tho',
  department: 'ICU',
  status: 'Đang sử dụng',
  dateAdded: '01/01/2025',
  documents: [],
  ...overrides,
});

test('expired registration is not classified as good and displays the expired status', () => {
  const device = makeDevice({
    documents: [
      {
        docType: 'Đăng kiểm',
        licenseNo: 'DK-01',
        frequency: '',
        issuedDate: '01/05/2025',
        expiryDate: '20/05/2026',
        prepTime: '30',
        status: 'Đã gửi',
        daysUntilExpiry: null,
      },
    ],
  });

  const flags = getDeviceStatusFlags(device, today);

  assert.equal(flags.expired, true);
  assert.equal(flags.good, false);
  assert.equal(matchesDeviceStatusFilter(device, 'expired', today), true);
  assert.equal(matchesDeviceStatusFilter(device, 'good', today), false);
  assert.deepEqual(resolveDeviceListStatus(device, { today }), {
    kind: 'expired',
    label: 'Hết hạn ĐK',
    className: 'is-danger',
    badgeVariant: 'danger',
    sheetStatus: 'Hết hạn đăng kiểm',
  });
});

test('active status filter controls the displayed status when a device matches multiple filters', () => {
  const device = makeDevice({
    status: 'Đang sửa chữa',
    documents: [
      {
        docType: 'Đăng kiểm',
        licenseNo: 'DK-02',
        frequency: '',
        issuedDate: '01/05/2025',
        expiryDate: '20/05/2026',
        prepTime: '30',
        status: 'Chưa gửi',
        daysUntilExpiry: -3,
      },
    ],
  });

  assert.equal(resolveDeviceListStatus(device, { today }).label, 'Hết hạn ĐK');
  assert.equal(resolveDeviceListStatus(device, { today, activeFilter: 'repairing' }).label, 'Đang sửa chữa');
});

test('warning, reported, repairing, and unassigned filters use the same flags as display status', () => {
  const warningDevice = makeDevice({
    documents: [
      {
        docType: 'Hiệu chuẩn',
        licenseNo: 'HC-01',
        frequency: '',
        issuedDate: '01/05/2025',
        expiryDate: '10/06/2026',
        prepTime: '30',
        status: 'Chưa gửi',
        daysUntilExpiry: null,
      },
    ],
  });
  const reportedDevice = makeDevice({ status: 'Báo hỏng - chờ duyệt' });
  const repairingDevice = makeDevice({ status: 'Đang kiểm tra' });
  const unassignedDevice = makeDevice({ department: 'Chưa phân bổ' });

  assert.equal(matchesDeviceStatusFilter(warningDevice, 'complianceWarning', today), true);
  assert.equal(resolveDeviceListStatus(warningDevice, { today }).label, 'Cảnh báo ĐK');

  assert.equal(matchesDeviceStatusFilter(reportedDevice, 'reported', today), true);
  assert.equal(resolveDeviceListStatus(reportedDevice, { today }).label, 'Báo hỏng');

  assert.equal(matchesDeviceStatusFilter(repairingDevice, 'repairing', today), true);
  assert.equal(resolveDeviceListStatus(repairingDevice, { today }).label, 'Đang sửa chữa');

  assert.equal(matchesDeviceStatusFilter(unassignedDevice, 'unassigned', today), true);
  assert.equal(resolveDeviceListStatus(unassignedDevice, { today }).label, 'Chưa phân bổ');
});
