import assert from 'node:assert/strict';
import test from 'node:test';
import { unwrapAppsScriptReadResponse } from '../src/services/apiEnvelope.ts';

test('Apps Script read responses throw server failure messages instead of returning empty data', () => {
  assert.throws(
    () => unwrapAppsScriptReadResponse({ success: false, message: 'Phiên đăng nhập đã hết hạn.' }),
    /Phiên đăng nhập đã hết hạn/
  );
});

test('Apps Script read responses unwrap success envelopes and keep legacy raw arrays', () => {
  assert.deepEqual(
    unwrapAppsScriptReadResponse({ success: true, data: [{ id: 'TB-001' }] }),
    [{ id: 'TB-001' }]
  );
  assert.deepEqual(unwrapAppsScriptReadResponse([{ id: 'TB-002' }]), [{ id: 'TB-002' }]);
});
