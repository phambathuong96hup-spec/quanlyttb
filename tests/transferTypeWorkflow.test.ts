import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('transfer requests are created by device type before admin assigns a concrete device', () => {
  const frontend = readFileSync('src/pages/Transfers.tsx', 'utf8');
  const api = readFileSync('src/services/api.ts', 'utf8');
  const gas = readFileSync('gas/Code.gs', 'utf8');

  assert.match(frontend, /createTransferTypeRequest/);
  assert.match(frontend, /assignTransferDevice/);
  assert.match(frontend, /Chờ admin chọn máy/);
  assert.match(frontend, /Mượn loại trang thiết bị gì/);
  assert.match(frontend, /fetchHisCategories/);
  assert.doesNotMatch(frontend, /Cho mượn \/ Luân chuyển đi/);
  assert.match(api, /createTransferTypeRequest/);
  assert.match(api, /assignTransferDevice/);
  assert.match(gas, /PENDING_ASSIGN/);
  assert.match(gas, /function createTransferTypeRequest_/);
  assert.match(gas, /function assignTransferDevice_/);
  assert.match(gas, /function transferStockGuardMessage_/);
  assert.match(gas, /phải còn ít nhất 1 thiết bị cùng loại/);
});
