import assert from 'node:assert/strict';
import { test } from 'node:test';
import { matchDeviceByCode } from '../src/components/qr/qrCodeMatcher.ts';
import type { DeviceData } from '../src/services/api.ts';

test('inventory lookup rejects partial and ambiguous device identifiers', () => {
  const devices = [{ id: 'TB-001', serial: 'DUP' }, { id: 'TB-002', serial: 'DUP' }] as DeviceData[];
  assert.equal(matchDeviceByCode(devices, 'TB-00').status, 'not_found');
  assert.equal(matchDeviceByCode(devices, 'DUP').status, 'ambiguous');
  const matched = matchDeviceByCode(devices, 'https://example.test/devices/TB-002');
  assert.equal(matched.status, 'found');
  if (matched.status === 'found') assert.equal(matched.device, devices[1]);
  const grouped = [{ id: 'A; B', serial: 'GROUP-1' }] as DeviceData[];
  for (const code of ['A; B', 'B']) {
    const result = matchDeviceByCode(grouped, code);
    assert.equal(result.status, 'found');
    if (result.status === 'found') assert.equal(result.device, grouped[0]);
  }
});
