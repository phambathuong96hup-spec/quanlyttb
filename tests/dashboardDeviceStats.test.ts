import assert from 'node:assert/strict';
import test from 'node:test';
import { buildDashboardDeviceSummary } from '../src/utils/dashboardDeviceStats.ts';
import type { DeviceData, RepairData } from '../src/services/api.ts';

const today = new Date('2026-05-23T00:00:00+07:00');

const makeDevice = (overrides: Partial<DeviceData>): DeviceData => ({
  id: 'TB-001',
  name: 'Máy monitor',
  department: 'ICU',
  status: 'Đang sử dụng',
  dateAdded: '01/01/2025',
  documents: [],
  ...overrides,
});

const makeRepair = (overrides: Partial<RepairData>): RepairData => ({
  rowId: '2026-05-23 08:00:00',
  deviceId: 'TB-001',
  userName: 'Khoa ICU',
  userEmail: 'icu@example.com',
  description: 'Không lên nguồn',
  status: 'Chờ duyệt',
  ...overrides,
});

test('dashboard stable count excludes expired registration and active repair devices', () => {
  const devices = [
    makeDevice({
      id: 'GOOD-001',
      documents: [{ docType: 'Đăng kiểm', licenseNo: 'DK-01', frequency: '', issuedDate: '01/01/2026', expiryDate: '01/01/2027', prepTime: '30', status: 'Đã gửi', daysUntilExpiry: null }],
    }),
    makeDevice({
      id: 'EXPIRED-001',
      documents: [{ docType: 'Đăng kiểm', licenseNo: 'DK-02', frequency: '', issuedDate: '01/01/2025', expiryDate: '20/05/2026', prepTime: '30', status: 'Đã gửi', daysUntilExpiry: null }],
    }),
    makeDevice({
      id: 'REPAIR-001',
      documents: [{ docType: 'Đăng kiểm', licenseNo: 'DK-03', frequency: '', issuedDate: '01/01/2026', expiryDate: '01/01/2027', prepTime: '30', status: 'Đã gửi', daysUntilExpiry: null }],
    }),
  ];

  const summary = buildDashboardDeviceSummary(devices, [
    makeRepair({ deviceId: 'REPAIR-001', status: 'Chờ duyệt' }),
    makeRepair({ deviceId: 'REPAIR-001', rowId: '2026-05-23 09:00:00', status: 'Đang sửa chữa' }),
    makeRepair({ deviceId: 'GOOD-001', rowId: '2026-05-22 09:00:00', status: 'Từ chối' }),
  ], today);

  assert.equal(summary.stableDeviceCount, 1);
  assert.equal(summary.expiredComplianceCount, 1);
  assert.equal(summary.activeRepairDeviceCount, 1);
});
