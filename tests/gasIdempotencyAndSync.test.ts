import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function createGasContext() {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  const baseContext: Record<string, unknown> = {
    console: { ...console },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => ({
          getRange: () => ({
            getValues: () => [[]],
            getDisplayValues: () => [[]],
            getDisplayValue: () => ''
          }),
          getLastColumn: () => 10,
          getLastRow: () => 1,
          appendRow: () => {}
        }),
        getId: () => 'test-sheet-id'
      }),
      flush: () => {}
    },
    Utilities: {
      getUuid: () => 'uuid-mock-' + Math.random().toString(36).slice(2, 9),
      computeDigest: (_alg: unknown, val: string) => {
        const bytes = [];
        for (let i = 0; i < 32; i++) {
          bytes.push((val.charCodeAt(i % val.length) || 0) % 256);
        }
        return bytes;
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' }
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => true,
        releaseLock: () => {}
      })
    }
  };

  const context = vm.createContext(baseContext);
  vm.runInContext(gas, context);
  return context;
}

test('handleIdempotentAction_ provides durable idempotency, isolation, payload matching, replay, and corrupted receipt handling', () => {
  const context = createGasContext();

  const idempotencyRows: Array<Record<string, unknown>> = [];
  let lockAcquiredCount = 0;
  let lockReleasedCount = 0;

  // Assign mocks AFTER vm load so function declarations in Code.gs do not overwrite them
  context.ensureSheet_ = () => {};
  context.userUsername_ = (user: Record<string, string>) => user.username || user['Tên đăng nhập'] || '';
  context.normalize_ = (s: string) => String(s || '').trim().toLowerCase();
  context.getRowsWithRowIndex_ = (sheetName: string) => {
    if (sheetName === 'IdempotencyKeys') {
      return idempotencyRows.map((data, idx) => ({ rowIndex: idx + 2, data }));
    }
    return [];
  };
  context.appendObject_ = (sheetName: string, obj: Record<string, unknown>) => {
    if (sheetName === 'IdempotencyKeys') {
      idempotencyRows.push({ ...obj });
    }
  };
  context.updateRowByObject_ = (sheetName: string, rowIndex: number, obj: Record<string, unknown>) => {
    if (sheetName === 'IdempotencyKeys') {
      const target = idempotencyRows[rowIndex - 2];
      if (target) Object.assign(target, obj);
    }
  };
  context.withDeviceMutationLock_ = (cb: () => unknown) => {
    lockAcquiredCount++;
    try {
      return cb();
    } finally {
      lockReleasedCount++;
    }
  };

  const handleIdempotent = context.handleIdempotentAction_ as (
    action: string,
    payload: Record<string, unknown>,
    actor: Record<string, string>,
    cb: () => { success: boolean; [key: string]: unknown }
  ) => { success: boolean; [key: string]: unknown };

  const actorAlice = { username: 'alice', 'Tên đăng nhập': 'alice' };
  const actorBob = { username: 'bob', 'Tên đăng nhập': 'bob' };

  // 1. First execution with requestId REQ-001
  let executionCount = 0;
  const result1 = handleIdempotent('reportRepair', { requestId: 'REQ-001', deviceId: 'TB-01' }, actorAlice, () => {
    executionCount++;
    return { success: true, message: 'Báo hỏng thành công', repairRowId: '123' };
  });

  assert.equal(result1.success, true);
  assert.equal(executionCount, 1);
  assert.equal(idempotencyRows.length, 1);
  assert.equal(idempotencyRows[0].Key, 'REQ-001');
  assert.equal(idempotencyRows[0].Status, 'COMPLETED');
  assert.equal(lockAcquiredCount, 2);
  assert.equal(lockReleasedCount, 2);

  // 2. Exact same request retried by Alice (replay cached response)
  const result2 = handleIdempotent('reportRepair', { requestId: 'REQ-001', deviceId: 'TB-01' }, actorAlice, () => {
    executionCount++;
    return { success: true, message: 'Should not run' };
  });

  assert.equal(result2.success, true);
  assert.equal(result2.repairRowId, '123');
  assert.equal(result2.idempotentReplay, true);
  assert.equal(executionCount, 1);

  // 3. Different actor (Bob) tries to reuse Alice's REQ-001 -> REJECTED
  const resultBob = handleIdempotent('reportRepair', { requestId: 'REQ-001', deviceId: 'TB-01' }, actorBob, () => {
    executionCount++;
    return { success: true };
  });
  assert.equal(resultBob.success, false);
  assert.match(resultBob.message as string, /RequestId thuộc về người dùng khác/);
  assert.equal(executionCount, 1);

  // 4. Same actor Alice sends same REQ-001 with different payload -> REJECTED (payload mismatch)
  const resultMismatch = handleIdempotent('reportRepair', { requestId: 'REQ-001', deviceId: 'TB-DIFFERENT' }, actorAlice, () => {
    executionCount++;
    return { success: true };
  });
  assert.equal(resultMismatch.success, false);
  assert.match(resultMismatch.message as string, /không khớp với RequestId/);
  assert.equal(executionCount, 1);

  // 5. Corrupted/empty receipts do NOT fake success: true and return CORRUPTED_RECEIPT
  const computeHash = context.computePayloadHash_ as (p: unknown) => string;
  const corruptReceipts = [
    'INVALID_JSON{',
    'null',
    'false',
    '[]',
    '{}',
    '{"message": "No success property"}',
    '{"success": "true"}' // success is string, not boolean
  ];

  corruptReceipts.forEach((badJson, idx) => {
    const key = 'REQ-CORRUPT-' + idx;
    idempotencyRows.push({
      Key: key,
      Username: 'alice',
      Action: 'reportRepair',
      PayloadHash: computeHash({ requestId: key, deviceId: 'TB-01' }),
      Status: 'COMPLETED',
      ResponseJson: badJson,
      CreatedAt: new Date(),
      UpdatedAt: new Date()
    });
    const res = handleIdempotent('reportRepair', { requestId: key, deviceId: 'TB-01' }, actorAlice, () => {
      executionCount++;
      return { success: true };
    });
    assert.equal(res.success, false, `Corrupted receipt "${badJson}" must not succeed`);
    assert.equal(res.code, 'CORRUPTED_RECEIPT', `Corrupted receipt "${badJson}" must return CORRUPTED_RECEIPT`);
    assert.equal(executionCount, 1, 'Callback must not be re-executed for corrupted receipt');
  });

  // 6. Fail-closed on missing stored metadata (Username, Action, PayloadHash)
  const metadataTestCases = [
    { name: 'missing username', row: { Key: 'REQ-META-1', Username: '', Action: 'reportRepair', PayloadHash: computeHash({ requestId: 'REQ-META-1', deviceId: 'TB-01' }), Status: 'COMPLETED', ResponseJson: '{"success": true}' }, expectedError: /thuộc về người dùng khác|thiếu thông tin xác thực/ },
    { name: 'missing action', row: { Key: 'REQ-META-2', Username: 'alice', Action: '', PayloadHash: computeHash({ requestId: 'REQ-META-2', deviceId: 'TB-01' }), Status: 'COMPLETED', ResponseJson: '{"success": true}' }, expectedError: /đã dùng cho hành động khác|thiếu thông tin hành động/ },
    { name: 'missing payload hash', row: { Key: 'REQ-META-3', Username: 'alice', Action: 'reportRepair', PayloadHash: '', Status: 'COMPLETED', ResponseJson: '{"success": true}' }, expectedError: /không khớp với RequestId/ }
  ];

  metadataTestCases.forEach((tc) => {
    idempotencyRows.push({
      ...tc.row,
      CreatedAt: new Date(),
      UpdatedAt: new Date()
    });
    const res = handleIdempotent('reportRepair', { requestId: tc.row.Key, deviceId: 'TB-01' }, actorAlice, () => {
      executionCount++;
      return { success: true };
    });
    assert.equal(res.success, false, `${tc.name} must fail closed`);
    assert.match(res.message as string, tc.expectedError);
    assert.equal(executionCount, 1, 'Callback must not run on metadata fail-closed');
  });

  // 7. Legitimate completed response with success: false is faithfully replayed
  idempotencyRows.push({
    Key: 'REQ-FAILED-COMPLETED',
    Username: 'alice',
    Action: 'reportRepair',
    PayloadHash: computeHash({ requestId: 'REQ-FAILED-COMPLETED', deviceId: 'TB-01' }),
    Status: 'COMPLETED',
    ResponseJson: JSON.stringify({ success: false, message: 'Khoa nhận không hợp lệ', code: 'INVALID_DEPT' }),
    CreatedAt: new Date(),
    UpdatedAt: new Date()
  });
  const resFailReplay = handleIdempotent('reportRepair', { requestId: 'REQ-FAILED-COMPLETED', deviceId: 'TB-01' }, actorAlice, () => {
    executionCount++;
    return { success: true };
  });
  assert.equal(resFailReplay.success, false);
  assert.equal(resFailReplay.message, 'Khoa nhận không hợp lệ');
  assert.equal(resFailReplay.code, 'INVALID_DEPT');
  assert.equal(resFailReplay.idempotentReplay, true);
  assert.equal(executionCount, 1, 'Callback must not run on replay of success: false');
});

test('handleIdempotentAction_ protects against stale processing replay and throw-after-append duplication', () => {
  const context = createGasContext();
  let rows: Array<Record<string, unknown>> = [];
  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => cb();
  context.userUsername_ = (actor: { username: string }) => actor.username;
  context.getRowsWithRowIndex_ = () => rows.map((data, i) => ({ data, rowIndex: i + 2 }));
  context.appendObject_ = (_sheet: string, data: Record<string, unknown>) => rows.push({ ...data });
  context.updateRowByObject_ = (_sheet: string, index: number, fields: Record<string, unknown>) => Object.assign(rows[index - 2], fields);
  context.getRows_ = () => []; // No business row found

  const handleIdempotent = context.handleIdempotentAction_ as (
    action: string,
    payload: Record<string, unknown>,
    actor: Record<string, string>,
    cb: () => { success: boolean; [key: string]: unknown }
  ) => { success: boolean; [key: string]: unknown };

  const computeHash = context.computePayloadHash_ as (p: unknown) => string;

  // Case A: Stale PROCESSING record (> 180s ago) must NOT re-execute without proof
  const payloadA = { requestId: 'review-retry-001', deviceId: 'TB-TEST' };
  rows.push({
    Key: payloadA.requestId,
    Username: 'reviewer',
    Action: 'reportRepair',
    PayloadHash: computeHash(payloadA),
    Status: 'PROCESSING',
    CreatedAt: new Date(Date.now() - 180000),
    UpdatedAt: new Date(Date.now() - 180000)
  });

  let writesA = 0;
  const resA = handleIdempotent('reportRepair', payloadA, { username: 'reviewer' }, () => {
    writesA++;
    return { success: true };
  });
  assert.equal(writesA, 0, 'Stale uncertain request must not re-execute callback');
  assert.equal(resA.success, false);
  assert.equal(resA.code, 'UNCERTAIN_STATE');

  // Case B: Callback throws after append; status becomes UNKNOWN and retry does NOT re-execute
  rows = [];
  let writesB = 0;
  const payloadB = { requestId: 'review-retry-002', deviceId: 'TB-TEST' };
  const failedAfterWrite = () => {
    writesB++;
    throw new Error('connection lost AFTER append');
  };

  const resB1 = handleIdempotent('reportRepair', payloadB, { username: 'reviewer' }, failedAfterWrite);
  assert.equal(resB1.success, false);
  assert.equal(resB1.code, 'EXECUTION_ERROR');
  assert.equal(writesB, 1);
  assert.equal(rows[0].Status, 'UNKNOWN');

  // Retry with same requestId:
  const resB2 = handleIdempotent('reportRepair', payloadB, { username: 'reviewer' }, failedAfterWrite);
  assert.equal(resB2.success, false);
  assert.equal(resB2.code, 'UNCERTAIN_STATE');
  assert.equal(writesB, 1, 'Retry must not re-execute callback when state is UNKNOWN');
});

test('handleIdempotentAction_ performs recovery lookup in target sheet before rejecting uncertain state', () => {
  const context = createGasContext();
  const rows: Array<Record<string, unknown>> = [];
  const repairRows: Array<Record<string, unknown>> = [
    {
      'Thời gian': '2026-05-15 08:30:00',
      'Mã Máy/Thiết bị': 'TB-RECOVER-01',
      'Người báo lỗi': 'Alice',
      'Email người báo': 'alice@example.com',
      'Mô tả lỗi': 'Hỏng nguồn [Ảnh minh chứng 1 - mat-truoc.jpg]: https://drive.google.com/file/d/test/view',
      'Trạng Thái': 'Chờ duyệt',
      'RequestId': 'REQ-RECOVER-100'
    }
  ];
  const pendingSyncRows: Array<Record<string, unknown>> = [
    {
      SyncId: 'SYNC-REC-100',
      RepairRowId: '2026-05-15 08:30:00',
      DeviceId: 'TB-RECOVER-01',
      Status: 'COMPLETED'
    }
  ];

  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => cb();
  context.userUsername_ = (actor: { username: string }) => actor.username;
  context.getRowsWithRowIndex_ = () => rows.map((data, i) => ({ data, rowIndex: i + 2 }));
  context.appendObject_ = (_sheet: string, data: Record<string, unknown>) => rows.push({ ...data });
  context.updateRowByObject_ = (_sheet: string, index: number, fields: Record<string, unknown>) => Object.assign(rows[index - 2], fields);
  context.getRows_ = (sheetName: string) => {
    if (sheetName === 'Repairs') return repairRows;
    if (sheetName === 'PendingSync') return pendingSyncRows;
    return [];
  };

  const computeHash = context.computePayloadHash_ as (p: unknown) => string;
  const payload = { requestId: 'REQ-RECOVER-100', deviceId: 'TB-RECOVER-01' };

  // Suppose idempotency row was left in UNKNOWN due to a network glitch after writing repair row
  rows.push({
    Key: payload.requestId,
    Username: 'alice',
    Action: 'reportRepair',
    PayloadHash: computeHash(payload),
    Status: 'UNKNOWN',
    CreatedAt: new Date(Date.now() - 60000),
    UpdatedAt: new Date(Date.now() - 60000)
  });

  let callbackCalled = false;
  const handleIdempotent = context.handleIdempotentAction_ as (
    action: string,
    payload: Record<string, unknown>,
    actor: Record<string, string>,
    cb: () => { success: boolean; [key: string]: unknown }
  ) => { success: boolean; [key: string]: unknown };

  const res = handleIdempotent('reportRepair', payload, { username: 'alice' }, () => {
    callbackCalled = true;
    return { success: true };
  });

  assert.equal(callbackCalled, false, 'Callback should not re-run when repair row already exists');
  assert.equal(res.success, true);
  assert.equal(res.idempotentReplay, true);
  assert.equal(res.repairRowId, '2026-05-15 08:30:00');
  assert.equal(res.syncStatus, 'completed');
  assert.equal(res.partialSuccess, false);
  assert.equal(res.attachmentCount, 1);
  assert.equal(rows[0].Status, 'COMPLETED');
});

test('findBusinessRecordByRequestId_ reports unknown syncStatus and needsManualReview when PendingSync is incomplete', () => {
  const context = createGasContext();
  const rows: Array<Record<string, unknown>> = [];
  const repairRows: Array<Record<string, unknown>> = [
    {
      'Thời gian': '2026-05-15 08:30:00',
      'Mã Máy/Thiết bị': 'TB-RECOVER-INCOMPLETE',
      'Người báo lỗi': 'Alice',
      'Email người báo': 'alice@example.com',
      'Mô tả lỗi': 'Hỏng nguồn [Ảnh minh chứng 1 - mat-truoc.jpg]: https://drive.google.com/file/d/test/view',
      'Trạng Thái': 'Chờ duyệt',
      'RequestId': 'REQ-RECOVER-INC'
    }
  ];
  // PendingSync is still PENDING (not COMPLETED)
  const pendingSyncRows: Array<Record<string, unknown>> = [
    {
      SyncId: 'SYNC-REC-INC',
      RepairRowId: '2026-05-15 08:30:00',
      DeviceId: 'TB-RECOVER-INCOMPLETE',
      Status: 'PENDING'
    }
  ];

  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => cb();
  context.userUsername_ = (actor: { username: string }) => actor.username;
  context.getRowsWithRowIndex_ = () => rows.map((data, i) => ({ data, rowIndex: i + 2 }));
  context.appendObject_ = (_sheet: string, data: Record<string, unknown>) => rows.push({ ...data });
  context.updateRowByObject_ = (_sheet: string, index: number, fields: Record<string, unknown>) => Object.assign(rows[index - 2], fields);
  context.getRows_ = (sheetName: string) => {
    if (sheetName === 'Repairs') return repairRows;
    if (sheetName === 'PendingSync') return pendingSyncRows;
    return [];
  };

  const computeHash = context.computePayloadHash_ as (p: unknown) => string;
  const payload = { requestId: 'REQ-RECOVER-INC', deviceId: 'TB-RECOVER-INCOMPLETE' };

  rows.push({
    Key: payload.requestId,
    Username: 'alice',
    Action: 'reportRepair',
    PayloadHash: computeHash(payload),
    Status: 'PROCESSING',
    CreatedAt: new Date(Date.now() - 60000),
    UpdatedAt: new Date(Date.now() - 60000)
  });

  const handleIdempotent = context.handleIdempotentAction_ as (
    action: string,
    payload: Record<string, unknown>,
    actor: Record<string, string>,
    cb: () => { success: boolean; [key: string]: unknown }
  ) => { success: boolean; [key: string]: unknown };

  const res = handleIdempotent('reportRepair', payload, { username: 'alice' }, () => ({ success: true }));

  assert.equal(res.success, true);
  assert.equal(res.idempotentReplay, true);
  assert.equal(res.partialSuccess, true);
  assert.equal(res.syncStatus, 'unknown');
  assert.equal(res.needsManualReview, true);
  assert.equal(res.attachmentCount, 1);
  assert.match(res.message as string, /chưa thể xác nhận hoàn thành/);
  // Because needsManualReview is true, idempotency receipt records UNKNOWN, not COMPLETED
  assert.equal(rows[0].Status, 'UNKNOWN');
});

test('reconcilePendingSyncs_ resolves pending device sync without overwriting newer/progressed states', () => {
  const context = createGasContext();

  const pendingSyncRows = [
    {
      SyncId: 'SYNC-1',
      TaskType: 'reportRepairDeviceSync',
      RepairRowId: '1001',
      DeviceId: 'TB-01',
      TargetStatus: 'Báo hỏng - chờ duyệt',
      CreatedAt: new Date('2026-05-01T10:00:00Z'),
      Status: 'PENDING',
      RetryCount: 1,
      UpdatedAt: new Date('2026-05-01T10:00:00Z'),
    },
    {
      SyncId: 'SYNC-2',
      TaskType: 'reportRepairDeviceSync',
      RepairRowId: '1002',
      DeviceId: 'TB-02',
      TargetStatus: 'Báo hỏng - chờ duyệt',
      CreatedAt: new Date('2026-05-01T10:00:00Z'),
      Status: 'PENDING',
      RetryCount: 1,
      UpdatedAt: new Date('2026-05-01T10:00:00Z'),
    },
    {
      SyncId: 'SYNC-3',
      TaskType: 'reportRepairDeviceSync',
      RepairRowId: '1003',
      DeviceId: 'TB-03',
      TargetStatus: 'Báo hỏng - chờ duyệt',
      CreatedAt: new Date('2026-05-01T10:00:00Z'),
      Status: 'PENDING',
      RetryCount: 1,
      UpdatedAt: new Date('2026-05-01T10:00:00Z'),
    }
  ];

  const devices: Record<string, Record<string, unknown>> = {
    'TB-01': {
      id: 'TB-01',
      'Tên Thiết bị': 'Máy theo dõi',
      'Hiện trạng thực tế': 'Hoạt động bình thường',
      'Ngày cập nhật': new Date('2026-04-01T10:00:00Z'), // Older than reportRepair -> MUST update to target
    },
    'TB-02': {
      id: 'TB-02',
      'Tên Thiết bị': 'Máy thở',
      'Hiện trạng thực tế': 'Đang sửa chữa', // Already progressed -> MUST SKIP
      'Ngày cập nhật': new Date('2026-05-02T10:00:00Z'),
    },
    'TB-03': {
      id: 'TB-03',
      'Tên Thiết bị': 'Máy đo điện tim',
      'Hiện trạng thực tế': 'Báo hỏng - chờ duyệt', // Already has targetStatus -> MUST sync aggregate and mark COMPLETED
      'Ngày cập nhật': new Date('2026-05-01T10:05:00Z'),
    }
  };

  const updatedDevices: Record<string, unknown> = {};
  let syncAggregateCount = 0;
  let lockCallCount = 0;

  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => {
    lockCallCount++;
    return cb();
  };
  context.getRowsWithRowIndex_ = (sheetName: string) => {
    if (sheetName === 'PendingSync') {
      return pendingSyncRows.map((data, idx) => ({ rowIndex: idx + 2, data }));
    }
    return [];
  };
  context.findDeviceById_ = (id: string) => devices[id] || null;
  context.findDeviceRow_ = (id: string) => (devices[id] ? 2 : -1);
  context.updateRowByObject_ = (sheetName: string, rowIndex: number, obj: Record<string, unknown>) => {
    if (sheetName === 'PendingSync') {
      Object.assign(pendingSyncRows[rowIndex - 2], obj);
    } else if (sheetName === 'Devices') {
      Object.assign(updatedDevices, obj);
    }
  };
  context.syncDeviceStatusForDevice_ = () => {
    syncAggregateCount++;
  };

  const reconcile = context.reconcilePendingSyncs_ as (actor: unknown) => {
    success: boolean;
    processed: number;
    succeeded: number;
    skipped: number;
  };

  const res = reconcile({ username: 'admin' });
  assert.equal(res.success, true);
  assert.equal(res.processed, 3);
  assert.equal(res.succeeded, 2); // TB-01 updated, TB-03 aggregate synced
  assert.equal(res.skipped, 1);   // TB-02 skipped (progressed)

  assert.equal(pendingSyncRows[0].Status, 'COMPLETED');
  assert.equal(pendingSyncRows[1].Status, 'SKIPPED_SUPERSEDED');
  assert.equal(pendingSyncRows[2].Status, 'COMPLETED');
  assert.ok(lockCallCount >= 3, 'Each pending item must acquire device mutation lock');
  assert.ok(syncAggregateCount >= 2, 'Aggregate status must be refreshed for succeeded items');
});

test('reportRepair_ handles pendingSync persistence failure with honest needsManualReview response', () => {
  const context = createGasContext();

  context.ensureSheet_ = (sheetName: string) => {
    if (sheetName === 'PendingSync') {
      throw new Error('Google Sheets quota exceeded: cannot write to PendingSync');
    }
  };
  context.withDeviceMutationLock_ = (cb: () => unknown) => cb();
  context.uploadEvidenceFilesToDrive_ = () => ({ files: [], failures: [] });
  context.appendRepairAndGetRowId_ = () => '2026-05-15 09:00:00';
  context.findDeviceById_ = () => ({
    id: 'TB-FAIL-01',
    'Tên Thiết bị': 'Máy sốc tim',
    'Hiện trạng thực tế': 'Hoạt động bình thường'
  });
  // Device update fails
  context.findDeviceRow_ = () => -1;
  context.logActivity_ = () => {};

  const reportRepair = context.reportRepair_ as (payload: Record<string, unknown>, actor: unknown) => {
    success: boolean;
    partialSuccess: boolean;
    syncStatus: string;
    needsManualReview?: boolean;
    message: string;
  };

  const res = reportRepair({ deviceId: 'TB-FAIL-01', description: 'Hỏng màn hình' }, { username: 'tech' });
  assert.equal(res.success, true);
  assert.equal(res.partialSuccess, true);
  assert.equal(res.syncStatus, 'unknown');
  assert.equal(res.needsManualReview, true);
  assert.match(res.message, /đối soát thủ công/);
});

test('reconcilePendingSyncs route requires Admin and triggerReconcilePendingSyncs is callable', () => {
  const context = createGasContext();
  context.ensureSheet_ = () => {};
  context.getRowsWithRowIndex_ = () => [];
  context.reconcilePendingSyncs_ = () => ({ success: true, processed: 0, succeeded: 0, skipped: 0 });

  const route = context.route_ as (action: string, payload: Record<string, unknown>) => { success: boolean; message?: string };
  const trigger = context.triggerReconcilePendingSyncs as () => { success: boolean };

  // Non-admin rejected
  context.requireAdmin_ = () => null;
  const rejectRes = route('reconcilePendingSyncs', { sessionToken: 'user-token' });
  assert.equal(rejectRes.success, false);
  assert.match(rejectRes.message as string, /Chỉ Admin/);

  // Admin accepted
  context.requireAdmin_ = () => ({ username: 'admin', 'Quyền hạn': 'admin' });
  const acceptRes = route('reconcilePendingSyncs', { sessionToken: 'admin-token' });
  assert.equal(acceptRes.success, true);

  // Standalone public trigger for time-driven triggers
  const triggerRes = trigger();
  assert.equal(triggerRes.success, true);
});

test('reportRepair_ preserves evidence and returns UNCERTAIN_WRITE with UNKNOWN idempotency status when appendRepairAndGetRowId_ throws', () => {
  const context = createGasContext();
  const idempotencyRows: Array<Record<string, unknown>> = [];
  let trashedCount = 0;

  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => cb();
  context.userUsername_ = (actor: { username: string }) => actor.username;
  context.uploadEvidenceFilesToDrive_ = () => ({
    files: [{ fileId: 'file-123', name: 'evidence.jpg', kind: 'Ảnh', url: 'https://drive.google.com/test' }],
    failures: []
  });
  context.discardEvidenceFiles_ = () => {
    trashedCount++;
  };
  context.appendRepairAndGetRowId_ = () => {
    throw new Error('Connection timeout while flushing appendRow');
  };
  context.getRowsWithRowIndex_ = (sheetName: string) => {
    if (sheetName === 'IdempotencyKeys') {
      return idempotencyRows.map((data, idx) => ({ rowIndex: idx + 2, data }));
    }
    return [];
  };
  context.appendObject_ = (sheetName: string, obj: Record<string, unknown>) => {
    if (sheetName === 'IdempotencyKeys') idempotencyRows.push({ ...obj });
  };
  context.updateRowByObject_ = (sheetName: string, rowIndex: number, obj: Record<string, unknown>) => {
    if (sheetName === 'IdempotencyKeys') Object.assign(idempotencyRows[rowIndex - 2], obj);
  };

  const handleIdempotent = context.handleIdempotentAction_ as (
    action: string,
    payload: Record<string, unknown>,
    actor: Record<string, string>,
    cb: () => { success: boolean; [key: string]: unknown }
  ) => { success: boolean; [key: string]: unknown };

  const reportRepair = context.reportRepair_ as (payload: Record<string, unknown>, actor: unknown) => {
    success: boolean;
    needsManualReview?: boolean;
    resultUnknown?: boolean;
    syncStatus?: string;
    code?: string;
    message?: string;
  };

  const payload = { requestId: 'REQ-APPEND-THROW', deviceId: 'TB-ERR-01', description: 'Hong van' };
  const actor = { username: 'technician' };

  const res = handleIdempotent('reportRepair', payload, actor, () => reportRepair(payload, actor));

  assert.equal(res.success, false);
  assert.equal(res.needsManualReview, true);
  assert.equal(res.resultUnknown, true);
  assert.equal(res.syncStatus, 'unknown');
  assert.equal(res.code, 'UNCERTAIN_WRITE');
  assert.match(res.message as string, /Tệp minh chứng được bảo toàn/);
  assert.equal(trashedCount, 0, 'Evidence files must NOT be trashed when append throws');

  // Must be marked UNKNOWN in idempotency keys so it will not falsely replay as completed
  assert.equal(idempotencyRows[0].Key, 'REQ-APPEND-THROW');
  assert.equal(idempotencyRows[0].Status, 'UNKNOWN');
});

test('reportRepair_ serializes device read, pendingSync creation and device update inside withDeviceMutationLock_', () => {
  const context = createGasContext();
  let lockCallCount = 0;
  let deviceUpdatedUnderLock = false;

  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => {
    lockCallCount++;
    return cb();
  };
  context.uploadEvidenceFilesToDrive_ = () => ({ files: [], failures: [] });
  context.appendRepairAndGetRowId_ = () => '2026-05-15 10:00:00';
  context.findDeviceById_ = () => ({
    id: 'TB-LOCK-01',
    'Tên Thiết bị': 'Máy theo dõi huyết áp',
    'Hiện trạng thực tế': 'Hoạt động bình thường',
    'Ngày cập nhật': new Date('2026-05-01')
  });
  context.findDeviceRow_ = () => 2;
  context.appendObject_ = () => {};
  context.updateRowByObject_ = (sheetName: string) => {
    if (sheetName === 'Devices' && lockCallCount >= 1) {
      deviceUpdatedUnderLock = true;
    }
  };
  context.syncDeviceStatusForDevice_ = () => {};
  context.logActivity_ = () => {};

  const reportRepair = context.reportRepair_ as (payload: Record<string, unknown>, actor: unknown) => {
    success: boolean;
    syncStatus: string;
  };

  const res = reportRepair({ deviceId: 'TB-LOCK-01', description: 'Hỏng dây' }, { username: 'nurse' });
  assert.equal(res.success, true);
  assert.equal(res.syncStatus, 'completed');
  assert.ok(lockCallCount >= 1, 'withDeviceMutationLock_ must be acquired during reportRepair_');
  assert.equal(deviceUpdatedUnderLock, true, 'Device row update must happen under lock');
});

test('reconcilePendingSyncs_ handles same-target aggregate sync error by keeping PENDING and updating LastError', () => {
  const context = createGasContext();
  const pendingSyncRows = [
    {
      SyncId: 'SYNC-SAME-TARGET-ERR',
      TaskType: 'reportRepairDeviceSync',
      RepairRowId: '9001',
      DeviceId: 'TB-SAME-01',
      TargetStatus: 'Báo hỏng - chờ duyệt',
      CreatedAt: new Date('2026-05-15T10:00:00Z'),
      Status: 'PENDING',
      LastError: '',
      RetryCount: 0,
      UpdatedAt: new Date('2026-05-15T10:00:00Z')
    }
  ];

  const devices: Record<string, Record<string, unknown>> = {
    'TB-SAME-01': {
      id: 'TB-SAME-01',
      'Tên Thiết bị': 'Bơm tiêm điện',
      'Hiện trạng thực tế': 'Báo hỏng - chờ duyệt', // Already has targetStatus
      'Ngày cập nhật': new Date('2026-05-15T10:00:00Z')
    }
  };

  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => cb();
  context.getRowsWithRowIndex_ = (sheetName: string) => {
    if (sheetName === 'PendingSync') {
      return pendingSyncRows.map((data, idx) => ({ rowIndex: idx + 2, data }));
    }
    return [];
  };
  context.findDeviceById_ = (id: string) => devices[id] || null;
  context.findDeviceRow_ = (id: string) => (devices[id] ? 2 : -1);
  context.updateRowByObject_ = (sheetName: string, rowIndex: number, obj: Record<string, unknown>) => {
    if (sheetName === 'PendingSync') {
      Object.assign(pendingSyncRows[rowIndex - 2], obj);
    }
  };
  // Simulate aggregate sync error:
  context.syncDeviceStatusForDevice_ = () => {
    throw new Error('Aggregate sync calculation crashed');
  };

  const reconcile = context.reconcilePendingSyncs_ as (actor: unknown) => {
    success: boolean;
    processed: number;
    succeeded: number;
    skipped: number;
  };

  const res = reconcile({ username: 'admin' });
  assert.equal(res.success, true);
  assert.equal(res.processed, 1);
  assert.equal(res.succeeded, 0, 'Must NOT increment succeeded when aggregate sync threw');
  assert.equal(res.skipped, 0);

  // Must keep PENDING, increment retry count, and save error
  assert.equal(pendingSyncRows[0].Status, 'PENDING');
  assert.equal(pendingSyncRows[0].RetryCount, 1);
  assert.match(pendingSyncRows[0].LastError as string, /Aggregate sync calculation crashed/);
});

test('reconcilePendingSyncs_ compares ExpectedUpdatedAt and skips newer normal state while updating old normal state', () => {
  const context = createGasContext();
  const pendingSyncRows = [
    {
      SyncId: 'SYNC-NEWER-NORMAL',
      TaskType: 'reportRepairDeviceSync',
      RepairRowId: '101',
      DeviceId: 'TB-NEWER',
      TargetStatus: 'Báo hỏng - chờ duyệt',
      ExpectedStatus: 'Hoạt động bình thường',
      ExpectedUpdatedAt: '2026-05-10 09:00:00',
      CreatedAt: '2026-05-10 10:00:00',
      Status: 'PENDING',
      RetryCount: 0
    },
    {
      SyncId: 'SYNC-OLDER-NORMAL',
      TaskType: 'reportRepairDeviceSync',
      RepairRowId: '102',
      DeviceId: 'TB-OLDER',
      TargetStatus: 'Báo hỏng - chờ duyệt',
      ExpectedStatus: 'Hoạt động bình thường',
      ExpectedUpdatedAt: '2026-05-10 09:00:00',
      CreatedAt: '2026-05-10 10:00:00',
      Status: 'PENDING',
      RetryCount: 0
    }
  ];

  const devices: Record<string, Record<string, unknown>> = {
    'TB-NEWER': {
      id: 'TB-NEWER',
      'Tên Thiết bị': 'Máy thở A',
      'Hiện trạng thực tế': 'Hoạt động bình thường',
      // Device was returned/repaired at 11:00:00 (NEWER than ExpectedUpdatedAt and CreatedAt)
      'Ngày cập nhật': '2026-05-10 11:00:00'
    },
    'TB-OLDER': {
      id: 'TB-OLDER',
      'Tên Thiết bị': 'Máy thở B',
      'Hiện trạng thực tế': 'Hoạt động bình thường',
      // Device had been updated at 08:00:00 (OLDER than ExpectedUpdatedAt)
      'Ngày cập nhật': '2026-05-10 08:00:00'
    }
  };

  const updatedDevices: Record<string, unknown> = {};

  context.ensureSheet_ = () => {};
  context.withDeviceMutationLock_ = (cb: () => unknown) => cb();
  context.getRowsWithRowIndex_ = (sheetName: string) => {
    if (sheetName === 'PendingSync') {
      return pendingSyncRows.map((data, idx) => ({ rowIndex: idx + 2, data }));
    }
    return [];
  };
  context.findDeviceById_ = (id: string) => devices[id] || null;
  context.findDeviceRow_ = (id: string) => (devices[id] ? 2 : -1);
  context.updateRowByObject_ = (sheetName: string, rowIndex: number, obj: Record<string, unknown>) => {
    if (sheetName === 'PendingSync') {
      Object.assign(pendingSyncRows[rowIndex - 2], obj);
    } else if (sheetName === 'Devices') {
      Object.assign(updatedDevices, obj);
    }
  };
  context.syncDeviceStatusForDevice_ = () => {};

  const reconcile = context.reconcilePendingSyncs_ as (actor: unknown) => {
    success: boolean;
    processed: number;
    succeeded: number;
    skipped: number;
  };

  const res = reconcile({ username: 'admin' });
  assert.equal(res.success, true);
  assert.equal(res.processed, 2);
  assert.equal(res.succeeded, 1, 'TB-OLDER should succeed');
  assert.equal(res.skipped, 1, 'TB-NEWER should be skipped');

  // TB-NEWER has newer normal state -> skipped with SKIPPED_SUPERSEDED
  assert.equal(pendingSyncRows[0].Status, 'SKIPPED_SUPERSEDED');
  assert.match(pendingSyncRows[0].LastError as string, /đã tiến triển hoặc có cập nhật mới hơn/);

  // TB-OLDER has older normal state -> updated and COMPLETED
  assert.equal(pendingSyncRows[1].Status, 'COMPLETED');
  assert.equal(updatedDevices['Hiện trạng thực tế'], 'Báo hỏng - chờ duyệt');
});
