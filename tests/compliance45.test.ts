import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInspectionItems } from '../src/utils/operationalInsights.ts';
import { getDeviceStatusFlags } from '../src/utils/deviceStatus.ts';
import type { DeviceData } from '../src/services/api.ts';

for (const status of ['Chưa gửi', 'Đã gửi', 'Đã phê duyệt']) {
  for (const days of [-1, 0, 44, 45, 46]) {
    test(`${status}: compliance at ${days} days uses common 45-day boundary`, () => {
      const device = { id: 'T', name: 'Test', department: 'Khoa A', status: 'Đang sử dụng', documents: [
        { docType: 'Kiểm định', status, expiryDate: '01/12/2026', daysUntilExpiry: days, prepTime: '90' },
      ] } as DeviceData;
      const item = buildInspectionItems([device])[0];
      assert.equal(item.needsAction, days <= 45);
      assert.equal(item.prepDays, 45);
      assert.equal(getDeviceStatusFlags(device).complianceWarning, days >= 0 && days <= 45);
      if (days < 0) assert.equal(item.statusKind, 'expired');
    });
  }
}
