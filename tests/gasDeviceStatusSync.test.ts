import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('getDevices syncs aggregate device status back to Google Sheet', () => {
  const source = readFileSync('gas/Code.gs', 'utf8');
  const body = source.match(/function getDevicesJoined_\(\) \{([\s\S]*?)\n\}/)?.[1] || '';

  assert.match(body, /syncDeviceAggregateStatusRow_/);
  assert.match(source, /if \(expired\) aggregateStatus = 'Hết hạn đăng kiểm'/);
  assert.match(source, /else if \(daysList\.length > 0\) complianceStatus = 'Còn hiệu lực'/);
});

test('reportRepair writes pharmacy broken reports as awaiting handling in Google Sheet', () => {
  const source = readFileSync('gas/Code.gs', 'utf8');

  assert.match(source, /function isPharmacyDepartment_\(department\)/);
  assert.match(source, /normalizeHeader_\(department\)\.indexOf\('khoaduoc'\) !== -1/);
  assert.match(source, /function reportRepairDeviceStatus_\(device\)/);
  assert.match(source, /return isPharmacyDepartment_\(department\) \? 'Hỏng chờ xử lý' : 'Báo hỏng - chờ duyệt';/);
  assert.match(source, /'Hiện trạng thực tế': reportRepairDeviceStatus_\(device\)/);
});
