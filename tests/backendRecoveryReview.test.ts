import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

test('recovery never uses a completed sync from another repair of the same device', () => {
  const context = vm.createContext({ console });
  vm.runInContext(readFileSync('gas/Code.gs', 'utf8'), context);
  context.getRows_ = (sheet: string) => sheet === 'Repairs'
    ? [{ RequestId: 'new-request', 'Thời gian': 'new-repair', 'Mã Máy/Thiết bị': 'TB-01' }]
    : [{ SyncId: 'old-sync', RepairRowId: 'old-repair', DeviceId: 'TB-01', Status: 'COMPLETED' }];
  const result = context.findBusinessRecordByRequestId_('reportRepair', 'new-request');
  assert.equal(result.success, true);
  assert.equal(result.syncStatus, 'unknown');
  assert.equal(result.needsManualReview, true);
  assert.equal(result.syncId, undefined);
});

test('repair approval writes under the same lock as pending reconciliation', () => {
  const context = vm.createContext({ console });
  vm.runInContext(readFileSync('gas/Code.gs', 'utf8'), context);
  let locked = false;
  let writes = 0;
  context.withDeviceMutationLock_ = (callback: () => unknown) => {
    locked = true;
    try { return callback(); } finally { locked = false; }
  };
  context.getRows_ = () => [{ 'Thời gian': 'repair', 'Mã Máy/Thiết bị': 'TB-01' }];
  context.uploadImageToDrive_ = () => { assert.equal(locked, false); return ''; };
  context.findDeviceRow_ = () => 2;
  context.updateRowByObject_ = () => { assert.equal(locked, true); writes++; };
  context.syncDeviceStatusForDevice_ = () => { assert.equal(locked, true); };
  context.findDeviceById_ = () => null;
  context.adminEmails_ = () => [];
  context.logActivity_ = () => {};
  assert.equal(context.approveRepair_({ rowId: 'repair', status: 'Đã hoàn thành' }, {}).success, true);
  assert.equal(writes, 2);
});
