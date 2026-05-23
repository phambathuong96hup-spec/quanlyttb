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
