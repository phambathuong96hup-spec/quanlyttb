import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHisDevicesUrl,
  getHisDevicesApiBaseUrl,
  unwrapHisDevicesResponse,
} from '../src/services/hisDevicesApi.ts';

test('his devices API base URL falls back to local FastAPI server', () => {
  assert.equal(getHisDevicesApiBaseUrl({}), 'http://127.0.0.1:8997');
});

test('his devices API URL appends filters without empty query values', () => {
  const url = buildHisDevicesUrl('/api/devices/in-use', {
    dept: 'ICU',
    category: '',
    search: 'monitor',
    page: 1,
  }, 'http://127.0.0.1:8997/');

  assert.equal(url, 'http://127.0.0.1:8997/api/devices/in-use?dept=ICU&search=monitor&page=1');
});

test('his devices API unwraps FastAPI success envelope', () => {
  const payload = unwrapHisDevicesResponse<{ total: number }>({
    success: true,
    data: { total: 3 },
  });

  assert.deepEqual(payload, { total: 3 });
});

test('his devices API throws message from FastAPI failure envelope', () => {
  assert.throws(
    () => unwrapHisDevicesResponse({ success: false, message: 'Database unavailable' }),
    /Database unavailable/
  );
});
