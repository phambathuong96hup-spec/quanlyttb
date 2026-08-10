import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const gasSource = readFileSync('gas/Code.gs', 'utf8');

const DEFAULT_SESSION_SECRET = '0123456789abcdef0123456789abcdef';
const DEFAULT_PIN_PEPPER = 'abcdef0123456789abcdef0123456789';

const loadGas = (overrides: { sessionSecret?: string; pinPepper?: string } = {}) => {
  const cache = new Map<string, string>();
  const scriptProperties: Record<string, string> = {
    SESSION_SECRET: overrides.sessionSecret ?? DEFAULT_SESSION_SECRET,
    PIN_PEPPER: overrides.pinPepper ?? DEFAULT_PIN_PEPPER,
  };
  const context = vm.createContext({
    console,
    setScriptProperty: (key: string, value: string) => { scriptProperties[key] = value; },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => scriptProperties[key] ?? null,
      }),
    },
    ScriptApp: { getScriptId: () => 'predictable-script-id' },
    CacheService: {
      getScriptCache: () => ({
        get: (key: string) => cache.get(key) || null,
        put: (key: string, value: string) => cache.set(key, value),
        remove: (key: string) => cache.delete(key),
      }),
    },
    Utilities: {
      Charset: { UTF_8: 'UTF-8' },
      base64EncodeWebSafe: (value: string | number[]) => Buffer.from(value as never).toString('base64url'),
      base64DecodeWebSafe: (value: string) => Array.from(Buffer.from(value, 'base64url')),
      computeHmacSha256Signature: (value: string, key: string) => (
        Array.from(createHmac('sha256', key).update(value).digest())
      ),
      getUuid: () => randomUUID(),
      newBlob: (value: number[]) => ({
        getDataAsString: () => Buffer.from(value).toString('utf8'),
      }),
    },
  });
  vm.runInContext(gasSource, context);
  return context;
};

test('doGet tolerates manual Apps Script execution without an event object', () => {
  const gas = loadGas();
  gas.json_ = (value: unknown) => value;
  gas.setupSheets = () => { throw new Error('manual health check must not touch sheets'); };

  const result = gas.doGet();

  assert.equal(result.success, true);
  assert.match(result.message, /Web app/i);
});

test('login bypasses device sheet initialization', () => {
  const gas = loadGas();
  let setupCalls = 0;
  gas.setupSheets = () => { setupCalls += 1; };
  gas.login_ = () => ({ success: true });

  const result = gas.route_('login', { username: 'latency-test', pin: '1234' });

  assert.equal(result.success, true);
  assert.equal(setupCalls, 0);
});

test('user directory cache avoids repeated sheet reads without caching a plaintext PIN', () => {
  const gas = loadGas();
  let sheetReads = 0;
  gas.userSheet_ = () => ({
    getLastRow: () => 2,
    getDataRange: () => ({
      getDisplayValues: () => {
        sheetReads += 1;
        return [
          ['Tên đăng nhập', 'Mã PIN', 'Trạng thái'],
          ['cached-user', '2468', 'active'],
        ];
      },
    }),
  });

  const first = gas.getUserRows_();
  const second = gas.getUserRows_();

  assert.equal(sheetReads, 1);
  assert.notEqual(first[0]['Mã PIN'], '2468');
  assert.equal(first[0]['Mã PIN'], second[0]['Mã PIN']);
  assert.equal(gas.verifyPin_('2468', first[0]['Mã PIN']), true);
  assert.equal(gas.verifyPin_('0000', first[0]['Mã PIN']), false);
});

test('login refreshes cached user data when a PIN was changed directly in the sheet', () => {
  const gas = loadGas();
  const cacheFlags: boolean[] = [];
  gas.getUserRows_ = (forceRefresh = false) => {
    cacheFlags.push(forceRefresh);
    return [{
      'Tên đăng nhập': 'sheet-user',
      'Mã PIN': forceRefresh ? '8642' : gas.cachedPinValue_('2468'),
      'Quyền hạn': 'user',
      'Trạng thái': 'active',
    }];
  };

  const result = gas.login_({ username: 'sheet-user', pin: '8642' });

  assert.equal(result.success, true);
  assert.deepEqual(cacheFlags, [false, true]);
});

test('updating a user invalidates the cached directory', () => {
  const gas = loadGas();
  let invalidations = 0;
  gas.invalidateUserRowsCache_ = () => { invalidations += 1; };
  gas.userSheet_ = () => ({
    getLastColumn: () => 2,
    getRange: (row: number) => row === 1
      ? { getValues: () => [['Tên đăng nhập', 'Mã PIN']] }
      : {
          getValues: () => [['cached-user', '2468']],
          setValues: () => undefined,
        },
  });

  gas.updateUserRowByObject_(2, { 'Mã PIN': '8642' });

  assert.equal(invalidations, 1);
});

test('getDevices and getDepartments reject requests without an authenticated session', () => {
  const gas = loadGas();
  gas.setupSheets = () => undefined;
  gas.requireAuthenticated_ = () => null;
  gas.getDevicesJoinedFiltered_ = () => ['private-device'];
  gas.getDepartments_ = () => ['private-department'];

  const devicesResult = gas.route_('getDevices', {});
  const departmentsResult = gas.route_('getDepartments', {});

  assert.equal(devicesResult.success, false);
  assert.equal(departmentsResult.success, false);
  assert.match(devicesResult.message, /Phiên đăng nhập/);
  assert.match(departmentsResult.message, /Phiên đăng nhập/);
});

test('device create and edit persist every editable Devices sheet field', () => {
  const gas = loadGas();
  const fields = {
    id: 'TB-NEW-001',
    'Tên Thiết bị': 'Máy theo dõi bệnh nhân',
    'Đơn vị tính': 'Cái',
    'Số lượng': '2',
    Model: 'PM-9000',
    'Seri Máy': 'SN-2026-001',
    'Nơi đặt thiết bị': 'Khoa Hồi sức',
    'Hiện trạng thực tế': 'Đang sử dụng',
    'Hãng SX': 'Mindray',
    'Nước SX': 'Trung Quốc',
    'Năm SX': '2025',
    'Năm SD': '2026',
    Giá: '120000000',
    Nguồn: 'Ngân sách nhà nước',
    'Phân loại': 'B',
    'Công ty cung ứng': 'Công ty Thiết bị Y tế',
    Nhóm: 'Monitor',
    'Ghi chú': 'Theo dõi tại giường',
    'Ngày tạo': 'không được tin cậy',
    'Trạng thái tổng hợp': 'không được tin cậy',
  };
  let appended: Record<string, unknown> | undefined;
  let updated: Record<string, unknown> | undefined;
  gas.appendObject_ = (_sheet: string, values: Record<string, unknown>) => { appended = values; };
  gas.updateRowByObject_ = (_sheet: string, _row: number, values: Record<string, unknown>) => { updated = values; };
  gas.nextDeviceId_ = () => 'TB-AUTO';
  let deviceLookupCount = 0;
  gas.findDeviceRow_ = (id: string) => {
    deviceLookupCount += 1;
    if (deviceLookupCount === 1) assert.equal(id, 'TB-NEW-001');
    if (deviceLookupCount === 2) assert.equal(id, 'SN-2026-001');
    if (deviceLookupCount === 3) assert.equal(id, 'TB-NEW-001');
    return deviceLookupCount === 3 ? 2 : -1;
  };
  gas.rowObject_ = () => ({ 'Tên Thiết bị': 'Tên cũ', 'Nơi đặt thiết bị': 'Khoa cũ' });
  gas.syncDeviceStatusForDevice_ = () => undefined;
  gas.logActivity_ = () => undefined;

  const added = gas.addDevice_({ fields }, { 'Tên đăng nhập': 'admin' });
  const edited = gas.editDevice_({ originalId: 'TB-NEW-001', fields }, { 'Tên đăng nhập': 'admin' });

  assert.equal(added.success, true);
  assert.equal(edited.success, true);
  assert.ok(appended);
  assert.ok(updated);
  Object.entries(fields).slice(0, 18).forEach(([header, value]) => {
    assert.equal(appended?.[header], value, `Thiếu trường thêm mới: ${header}`);
    if (header !== 'id') assert.equal(updated?.[header], value, `Thiếu trường chỉnh sửa: ${header}`);
  });
  assert.notEqual(appended?.['Ngày tạo'], 'không được tin cậy');
  assert.equal(updated?.['Trạng thái tổng hợp'], undefined);
});

test('duplicate sheet headers preserve the first non-empty value and only update the canonical column', () => {
  const gas = loadGas();
  const headers = ['id', 'Nhóm', 'Trạng thái tổng hợp', 'Nhóm', 'Trạng thái tổng hợp'];
  const row = ['TB-001', 'Monitor', 'Đang sử dụng', '', ''];

  assert.deepEqual({ ...gas.rowObjectFromValues_(headers, row) }, {
    id: 'TB-001',
    Nhóm: 'Monitor',
    'Trạng thái tổng hợp': 'Đang sử dụng',
  });
  assert.deepEqual(
    Array.from(gas.objectToAppendRow_(headers, { id: 'TB-002', Nhóm: 'Máy thở', 'Trạng thái tổng hợp': 'Tốt' })),
    ['TB-002', 'Máy thở', 'Tốt', '', ''],
  );
  assert.deepEqual(
    Array.from(gas.applyObjectToRow_(headers, row, { Nhóm: 'Máy theo dõi' })),
    ['TB-001', 'Máy theo dõi', 'Đang sử dụng', '', ''],
  );
});

test('adding a device rejects an id or serial that already identifies another row', () => {
  const gas = loadGas();
  let appended = false;
  gas.appendObject_ = () => { appended = true; };
  gas.findDeviceRow_ = () => 7;
  gas.syncDeviceStatusForDevice_ = () => undefined;
  gas.logActivity_ = () => undefined;

  const result = gas.addDevice_({ fields: {
    id: 'TB-TRUNG',
    'Seri Máy': 'SN-TRUNG',
    'Tên Thiết bị': 'Máy theo dõi',
    'Nơi đặt thiết bị': 'Khoa Nội',
  } }, { 'Tên đăng nhập': 'admin' });

  assert.equal(result.success, false);
  assert.match(result.message, /đã tồn tại|trùng/i);
  assert.equal(appended, false);
});

test('device text that resembles a formula is stored as literal sheet content', () => {
  const gas = loadGas();
  let appended: Record<string, unknown> | undefined;
  gas.appendObject_ = (_sheet: string, values: Record<string, unknown>) => { appended = values; };
  gas.findDeviceRow_ = () => -1;
  gas.syncDeviceStatusForDevice_ = () => undefined;
  gas.logActivity_ = () => undefined;

  const result = gas.addDevice_({ fields: {
    id: 'TB-SAFE-001',
    'Tên Thiết bị': '=IMPORTDATA("https://example.test")',
    'Nơi đặt thiết bị': 'Khoa Nội',
  } }, { 'Tên đăng nhập': 'admin' });

  assert.equal(result.success, true);
  assert.equal(appended?.['Tên Thiết bị'], "'=IMPORTDATA(\"https://example.test\")");
});

test('device edit targets its exact sheet row and rejects a stale form', () => {
  const gas = loadGas();
  let updated: Record<string, unknown> | undefined;
  let syncedRow = 0;
  gas.findDeviceRow_ = () => { throw new Error('Không được dò dòng đầu tiên khi đã có row index.'); };
  gas.rowObject_ = (_sheet: string, rowIndex: number) => {
    assert.equal(rowIndex, 9);
    return {
      id: 'TB-DUP',
      'Seri Máy': 'SN-DUP-2',
      'Tên Thiết bị': 'Máy theo dõi',
      'Nơi đặt thiết bị': 'Khoa Nội',
      'Ngày cập nhật': '10/08/2026 08:00:00',
    };
  };
  gas.updateRowByObject_ = (_sheet: string, rowIndex: number, values: Record<string, unknown>) => {
    assert.equal(rowIndex, 9);
    updated = values;
  };
  gas.syncDeviceStatusForDevice_ = (_id: string, rowIndex: number) => { syncedRow = rowIndex; };
  gas.logActivity_ = () => undefined;

  const saved = gas.editDevice_({
    originalId: 'TB-DUP',
    originalRowIndex: 9,
    expectedUpdatedAt: '10/08/2026 08:00:00',
    fields: { 'Ghi chú': 'Đã hiệu chuẩn' },
  }, { 'Tên đăng nhập': 'admin' });

  assert.equal(saved.success, true);
  assert.equal(updated?.['Ghi chú'], 'Đã hiệu chuẩn');
  assert.equal(updated?.['Tên Thiết bị'], undefined);
  assert.equal(syncedRow, 9);

  updated = undefined;
  const stale = gas.editDevice_({
    originalId: 'TB-DUP',
    originalRowIndex: 9,
    expectedUpdatedAt: '09/08/2026 10:00:00',
    fields: { 'Ghi chú': 'Dữ liệu cũ' },
  }, { 'Tên đăng nhập': 'admin' });
  assert.equal(stale.success, false);
  assert.match(stale.message, /được người khác cập nhật|tải lại/i);
  assert.equal(updated, undefined);
});

test('repair visibility is limited to the actor or their department while admin sees all', () => {
  const gas = loadGas();
  assert.equal(typeof gas.filterRepairsForActor_, 'function');

  const rows = [
    { 'Mã Máy/Thiết bị': 'TB-01', 'Tên đăng nhập người báo': 'owner', 'Email người báo': 'owner@example.com', 'Khoa/Phòng': 'Khoa Nội' },
    { 'Mã Máy/Thiết bị': 'TB-02', 'Tên đăng nhập người báo': 'other', 'Email người báo': 'other@example.com', 'Khoa/Phòng': 'Khoa Nội' },
    { 'Mã Máy/Thiết bị': 'TB-03', 'Tên đăng nhập người báo': 'other', 'Email người báo': 'other@example.com', 'Khoa/Phòng': 'Khoa Ngoại' },
  ];
  const actor = {
    'Tên đăng nhập': 'owner',
    Email: 'owner@example.com',
    'Khoa/Phòng': 'Khoa Nội',
    'Quyền hạn': 'user',
  };
  const admin = { ...actor, 'Quyền hạn': 'admin' };

  assert.deepEqual(
    Array.from(gas.filterRepairsForActor_(rows, actor)).map((row: { 'Mã Máy/Thiết bị': string }) => row['Mã Máy/Thiết bị']),
    ['TB-01', 'TB-02'],
  );
  assert.equal(gas.filterRepairsForActor_(rows, admin).length, 3);
});

test('repair access and completion never trust mutable name or email identity', () => {
  const gas = loadGas();
  const actor = {
    'Tên đăng nhập': 'owner',
    Email: 'spoofed@example.com',
    'Họ và Tên': 'Spoofed Reporter',
    'Khoa/Phòng': 'Khoa Nội',
    'Quyền hạn': 'user',
  };
  const repair = {
    'Thời gian': 'ROW-1',
    'Mã Máy/Thiết bị': 'TB-OTHER',
    'Tên đăng nhập người báo': 'other',
    'Email người báo': 'spoofed@example.com',
    'Người báo lỗi': 'Spoofed Reporter',
    'Khoa/Phòng': 'Khoa Ngoại',
  };

  assert.equal(gas.filterRepairsForActor_([repair], actor).length, 0);
  gas.getRows_ = () => [repair];
  gas.findDeviceById_ = () => ({ id: 'TB-OTHER', 'Nơi đặt thiết bị': 'Khoa Ngoại' });
  assert.equal(gas.canConfirmRepairCompletion_({ rowId: 'ROW-1', newStatus: 'Đã hoàn thành' }, actor), false);

  const ownedRepair = { ...repair, 'Tên đăng nhập người báo': 'owner' };
  gas.getRows_ = () => [ownedRepair];
  assert.equal(gas.canConfirmRepairCompletion_({ rowId: 'ROW-1', newStatus: 'Đã hoàn thành' }, actor), true);
});

test('transfer visibility is limited to participants and source/destination departments', () => {
  const gas = loadGas();
  assert.equal(typeof gas.filterTransfersForActor_, 'function');

  const rows = [
    { TransferId: 'LC-01', FromDepartment: 'Khoa Nội', ToDepartment: 'Khoa Ngoại', RequestedBy: 'other' },
    { TransferId: 'LC-02', FromDepartment: 'Khoa Dược', ToDepartment: 'Khoa Nhi', RequestedBy: 'owner' },
    { TransferId: 'LC-03', FromDepartment: 'Khoa Dược', ToDepartment: 'Khoa Nhi', RequestedBy: 'other' },
  ];
  const actor = {
    'Tên đăng nhập': 'owner',
    Email: 'owner@example.com',
    'Khoa/Phòng': 'Khoa Nội',
    'Quyền hạn': 'user',
  };

  assert.deepEqual(
    Array.from(gas.filterTransfersForActor_(rows, actor)).map((row: { TransferId: string }) => row.TransferId),
    ['LC-01', 'LC-02'],
  );

  const emailSpoof = [{
    TransferId: 'LC-04',
    FromDepartment: 'Khoa Dược',
    ToDepartment: 'Khoa Nhi',
    RequestedBy: 'other',
    RequestedByEmail: 'owner@example.com',
  }];
  assert.equal(gas.filterTransfersForActor_(emailSpoof, actor).length, 0);
});

test('non-admin transfer-type requests cannot impersonate another destination department', () => {
  const gas = loadGas();
  const actor = {
    'Tên đăng nhập': 'khoa-noi-user',
    'Khoa/Phòng': 'Khoa Nội',
    'Quyền hạn': 'user',
  };
  gas.findUser_ = () => actor;
  gas.nextTransferId_ = () => 'LC-1';
  gas.appendObject_ = () => undefined;
  gas.logActivity_ = () => undefined;

  const result = gas.createTransferTypeRequest_({
    actorUsername: 'khoa-noi-user',
    deviceType: 'Máy thở',
    toDepartment: 'Khoa Ngoại',
  });

  assert.equal(result.success, false);
  assert.match(result.message, /khoa.*nhận|khoa.*tài khoản/i);
});

test('SESSION_SECRET is mandatory and PIN hashes use a salted representation', () => {
  const gasWithoutSecret = loadGas({ sessionSecret: '' });
  assert.throws(() => gasWithoutSecret.sessionSecret_(), /SESSION_SECRET/);

  const gas = loadGas();
  assert.equal(typeof gas.hashPin_, 'function');
  assert.equal(typeof gas.verifyPin_, 'function');
  const stored = gas.hashPin_('1234');

  assert.match(stored, /^v1\$/);
  assert.equal(stored.includes('1234'), false);
  assert.equal(gas.verifyPin_('1234', stored), true);
  assert.equal(gas.verifyPin_('9999', stored), false);
});

test('PIN_PEPPER is mandatory, independent, and at least 32 characters', () => {
  const gasWithoutPepper = loadGas({ pinPepper: '' });
  const gasWithShortPepper = loadGas({ pinPepper: 'too-short' });

  assert.throws(() => gasWithoutPepper.pinPepper_(), /PIN_PEPPER/);
  assert.throws(() => gasWithShortPepper.pinPepper_(), /PIN_PEPPER/);
  assert.throws(() => gasWithoutPepper.hashPin_('1234'), /PIN_PEPPER/);
});

test('rotating SESSION_SECRET does not invalidate an existing PIN hash', () => {
  const gas = loadGas();
  const stored = gas.hashPin_('1234');

  gas.setScriptProperty('SESSION_SECRET', 'fedcba9876543210fedcba9876543210');

  assert.equal(gas.verifyPin_('1234', stored), true);
});

test('rotating PIN_PEPPER invalidates hashes made with the previous pepper', () => {
  const gas = loadGas();
  const stored = gas.hashPin_('1234');

  gas.setScriptProperty('PIN_PEPPER', '9876543210abcdef9876543210abcdef');

  assert.equal(gas.verifyPin_('1234', stored), false);
});

test('user responses remove PIN fields even when a legacy header has unusual spacing', () => {
  const gas = loadGas();
  const safeUser = gas.sanitizeUser_({
    'Tên đăng nhập': 'legacy',
    'Mật  khẩu': 'plaintext-secret',
    'Họ và Tên': 'Legacy User',
  });

  assert.equal(Object.keys(safeUser).some(key => key.includes('khẩu')), false);
  assert.equal(safeUser['Tên đăng nhập'], 'legacy');
});

test('a successful legacy PIN login does not rewrite the PIN cell', () => {
  const gas = loadGas();
  const user = {
    'Tên đăng nhập': 'legacy',
    'Mã PIN': '1234',
    'Quyền hạn': 'user',
    'Họ và Tên': 'Legacy User',
    Email: 'legacy@example.com',
    'Khoa/Phòng': 'Khoa Nội',
    'Trạng thái': 'active',
  };
  let updateCalls = 0;
  let auditAction = '';
  gas.getUserRows_ = () => [user];
  gas.findUserRowIndex_ = () => 2;
  gas.updateUserRowByObject_ = () => { updateCalls += 1; };
  gas.logActivity_ = (action: string) => { auditAction = action; };

  const result = gas.login_({ username: 'legacy', pin: '1234' });

  assert.equal(result.success, true);
  assert.equal(updateCalls, 0);
  assert.equal(auditAction, '');
});

test('legacy password aliases remain unchanged during login', () => {
  const gas = loadGas();
  const user = {
    'Tên đăng nhập': 'legacy-password',
    'Mật khẩu': '2468',
    'Quyền hạn': 'user',
    'Trạng thái': 'active',
  };
  let updateCalls = 0;
  gas.getUserRows_ = () => [user];
  gas.findUserRowIndex_ = () => 2;
  gas.updateUserRowByObject_ = () => { updateCalls += 1; };
  gas.logActivity_ = () => undefined;

  const result = gas.login_({ username: 'legacy-password', pin: '2468' });

  assert.equal(result.success, true);
  assert.equal(updateCalls, 0);
});

test('repeated invalid PIN attempts temporarily block even a later valid PIN', () => {
  const gas = loadGas();
  gas.getUserRows_ = () => [{
    'Tên đăng nhập': 'locked-user',
    'Mã PIN': '1234',
    'Quyền hạn': 'user',
    'Trạng thái': 'active',
  }];
  gas.findUserRowIndex_ = () => 2;
  gas.updateUserRowByObject_ = () => undefined;
  gas.logActivity_ = () => undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    gas.login_({ username: 'locked-user', pin: '0000' });
  }
  const blocked = gas.login_({ username: 'locked-user', pin: '1234' });

  assert.equal(blocked.success, false);
  assert.match(blocked.message, /thử lại|tạm khóa/i);
});

test('rate limiting uses the canonical account across username and email aliases', () => {
  const gas = loadGas();
  gas.getUserRows_ = () => [{
    'Tên đăng nhập': 'same-account',
    Email: 'same-account@example.com',
    'Mã PIN': '1234',
    'Quyền hạn': 'user',
    'Trạng thái': 'active',
  }];
  gas.findUserRowIndex_ = () => 2;
  gas.updateUserRowByObject_ = () => undefined;
  gas.logActivity_ = () => undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    gas.login_({ username: 'same-account', pin: '0000' });
  }
  const blocked = gas.login_({ username: 'same-account@example.com', pin: '1234' });

  assert.equal(blocked.success, false);
  assert.match(blocked.message, /thử lại|tạm khóa/i);
});

test('rate-limit keys do not collide when account identifiers contain punctuation', () => {
  const gas = loadGas();
  gas.getUserRows_ = () => [{
    'Tên đăng nhập': 'accountab',
    'Mã PIN': '1234',
    'Quyền hạn': 'user',
    'Trạng thái': 'active',
  }];
  gas.findUserRowIndex_ = () => 2;
  gas.updateUserRowByObject_ = () => undefined;
  gas.logActivity_ = () => undefined;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    gas.login_({ username: 'account.ab', pin: '0000' });
  }
  const validAccount = gas.login_({ username: 'accountab', pin: '1234' });

  assert.equal(validAccount.success, true);
});

test('changing a PIN replaces a legacy password alias with a hash', () => {
  const gas = loadGas();
  const actor = {
    'Tên đăng nhập': 'self',
    'Mật khẩu': '1357',
    'Quyền hạn': 'user',
    'Trạng thái': 'active',
  };
  let updated: Record<string, string> | null = null;
  gas.requireAuthenticated_ = () => actor;
  gas.findUserRowIndex_ = () => 2;
  gas.findUser_ = () => actor;
  gas.updateUserRowByObject_ = (_rowIndex: number, values: Record<string, string>) => { updated = values; };
  gas.logActivity_ = () => undefined;

  const result = gas.editUser_({ username: 'self', currentPin: '1357', newPin: '8642' });

  assert.equal(result.success, true);
  assert.ok(updated);
  assert.match(updated!['Mật khẩu'], /^v1\$/);
  assert.equal(updated!['Mật khẩu'].includes('8642'), false);
});

test('non-admin profile edits cannot change identity or department and the ignored attempt is audited', () => {
  const gas = loadGas();
  const actor = {
    'Tên đăng nhập': 'self',
    'Mã PIN': gas.hashPin_('1357'),
    'Họ và Tên': 'Tên cũ',
    'Khoa/Phòng': 'Khoa Nội',
    'Quyền hạn': 'user',
    'Trạng thái': 'active',
  };
  let updated: Record<string, string> | null = null;
  const auditActions: string[] = [];
  gas.requireAuthenticated_ = () => actor;
  gas.findUserRowIndex_ = () => 2;
  gas.findUser_ = () => actor;
  gas.updateUserRowByObject_ = (_rowIndex: number, values: Record<string, string>) => { updated = values; };
  gas.logActivity_ = (action: string) => { auditActions.push(action); };

  const result = gas.editUser_({
    username: 'self',
    fullName: 'Tên mới',
    email: 'spoofed@example.com',
    department: 'Khoa Ngoại',
  });

  assert.equal(result.success, true);
  assert.equal(updated, null);
  assert.ok(auditActions.includes('Từ chối sửa hồ sơ người dùng'));
});

test('a new document cannot grant its own access through untrusted responsibility fields', () => {
  const gas = loadGas();
  const actor = {
    'Tên đăng nhập': 'khoa-noi-user',
    'Họ và Tên': 'Người tự khai',
    'Khoa/Phòng': 'Khoa Nội',
    'Quyền hạn': 'user',
  };
  const device = { id: 'TB-OTHER', 'Tên Thiết bị': 'Máy khoa khác', 'Nơi đặt thiết bị': 'Khoa Ngoại' };
  gas.getRows_ = (sheetName: string) => sheetName === 'Devices' ? [device] : [];
  gas.appendObject_ = () => undefined;
  gas.syncDeviceStatusForDevice_ = () => undefined;
  gas.logActivity_ = () => undefined;

  const result = gas.addDocument_({
    serial: 'TB-OTHER',
    docType: 'Kiểm định',
    responsible: 'Người tự khai',
  }, actor);

  assert.equal(result.success, false);
  assert.match(result.message, /không có quyền/i);
});

test('operational state and shared inventory history actions enforce their access contracts', () => {
  const gas = loadGas();
  gas.setupSheets = () => undefined;
  gas.requireAuthenticated_ = () => null;
  gas.requireAdmin_ = () => null;

  assert.equal(gas.route_('getOperationalState', {}).success, false);
  assert.equal(gas.route_('getInventoryRuns', {}).success, false);
  assert.equal(gas.route_('saveWorkflowOverride', {}).success, false);
  assert.equal(gas.route_('addCostEntry', {}).success, false);
  assert.equal(gas.route_('deleteCostEntry', {}).success, false);

  const admin = { 'Tên đăng nhập': 'admin', 'Quyền hạn': 'admin' };
  gas.requireAuthenticated_ = () => admin;
  gas.requireAdmin_ = () => admin;
  gas.getOperationalState_ = () => ({ success: true, data: { workflowOverrides: {}, costEntries: [] } });
  gas.getInventoryRuns_ = () => ({ success: true, data: [] });
  gas.saveWorkflowOverride_ = () => ({ success: true });
  gas.addCostEntry_ = () => ({ success: true });
  gas.deleteCostEntry_ = () => ({ success: true });

  assert.equal(gas.route_('getOperationalState', {}).success, true);
  assert.equal(gas.route_('getInventoryRuns', {}).success, true);
  assert.equal(gas.route_('saveWorkflowOverride', {}).success, true);
  assert.equal(gas.route_('addCostEntry', {}).success, true);
  assert.equal(gas.route_('deleteCostEntry', {}).success, true);
});

test('shared inventory registry rows map back to the frontend run contract', () => {
  const gas = loadGas();
  assert.equal(typeof gas.getInventoryRuns_, 'function');
  gas.getRows_ = () => [{
    RunId: 'RUN-1',
    'Tên đợt': 'Kiểm kê tháng 7',
    SheetName: 'KK - T7',
    'Khoa/Phòng': 'Khoa Nội',
    'Người tạo': 'Admin',
    'Ngày tạo': '14/07/2026',
    'Trạng thái': 'Đang kiểm kê',
    'Tổng thiết bị': '10',
    'Đã quét': '7',
    'Chưa quét': '3',
    'Sai khoa/phòng': '1',
    'Ngày cập nhật': '14/07/2026',
  }];

  const result = gas.getInventoryRuns_();
  const run = result.data[0];
  assert.equal(run.runId, 'RUN-1');
  assert.equal(run.name, 'Kiểm kê tháng 7');
  assert.equal(run.totalDevices, 10);
  assert.equal(run.scannedCount, 7);
  assert.equal(run.missingCount, 3);
  assert.equal(run.wrongDepartmentCount, 1);
  assert.equal(run.updatedAt, '14/07/2026');
});

test('deleteInventoryRun requires a registry entry and never trusts payload sheetName', () => {
  const gas = loadGas();
  let deletedSheet = '';
  gas.getRowsWithRowIndex_ = () => [];
  gas.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => ({ name }),
    getSheets: () => [{}, {}],
    deleteSheet: (sheet: { name: string }) => { deletedSheet = sheet.name; },
  });
  gas.logActivity_ = () => undefined;

  const result = gas.deleteInventoryRun_({ runId: 'MISSING', sheetName: 'UnrelatedSheet' }, {
    'Tên đăng nhập': 'user',
    'Quyền hạn': 'user',
  });

  assert.equal(result.success, false);
  assert.equal(deletedSheet, '');
});

test('inventory creator deletion uses only the sheet name stored in the registry', () => {
  const gas = loadGas();
  let deletedSheet = '';
  let deletedRegistryRow = 0;
  gas.getRowsWithRowIndex_ = () => [{
    rowIndex: 4,
    data: {
      RunId: 'RUN-1',
      SheetName: 'KK - Trusted',
      'Tên đăng nhập người tạo': 'creator',
    },
  }];
  gas.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => name === 'InventoryRuns'
      ? { deleteRow: (row: number) => { deletedRegistryRow = row; } }
      : { name },
    getSheets: () => [{}, {}],
    deleteSheet: (sheet: { name: string }) => { deletedSheet = sheet.name; },
  });
  gas.logActivity_ = () => undefined;

  const result = gas.deleteInventoryRun_({ runId: 'RUN-1', sheetName: 'UnrelatedSheet' }, {
    'Tên đăng nhập': 'creator',
    'Quyền hạn': 'user',
  });

  assert.equal(result.success, true);
  assert.equal(deletedSheet, 'KK - Trusted');
  assert.equal(deletedRegistryRow, 4);
});

test('only the stable inventory creator or an admin can update and delete an existing run', () => {
  const gas = loadGas();
  const existing = {
    rowIndex: 2,
    data: {
      RunId: 'RUN-OWNED',
      SheetName: 'KK - Owned',
      'Người tạo': 'Original Creator',
      'Tên đăng nhập người tạo': 'creator',
    },
  };
  let detailWrites = 0;
  let deletedSheets = 0;
  gas.getRowsWithRowIndex_ = () => [existing];
  gas.replaceSheetRows_ = () => { detailWrites += 1; };
  gas.upsertInventoryRunRegistry_ = () => undefined;
  gas.deviceSpreadsheet_ = () => ({
    getSheetByName: () => ({ deleteRow: () => undefined }),
    getSheets: () => [{}, {}],
    deleteSheet: () => { deletedSheets += 1; },
  });
  gas.logActivity_ = () => undefined;
  const otherUser = { 'Tên đăng nhập': 'other', 'Họ và Tên': 'Other User', 'Quyền hạn': 'user' };

  const saveResult = gas.saveInventoryRun_({ runId: 'RUN-OWNED', name: 'Tampered', scans: [] }, otherUser);
  const deleteResult = gas.deleteInventoryRun_({ runId: 'RUN-OWNED' }, otherUser);

  assert.equal(saveResult.success, false);
  assert.equal(deleteResult.success, false);
  assert.equal(detailWrites, 0);
  assert.equal(deletedSheets, 0);
});

test('inventory registry derives creator identity from actor and preserves it on updates', () => {
  const gas = loadGas();
  const actor = {
    'Tên đăng nhập': 'creator',
    'Họ và Tên': 'Trusted Creator',
    'Quyền hạn': 'user',
  };
  let createdRow: Record<string, unknown> | null = null;
  let updatedRow: Record<string, unknown> | null = null;
  gas.getRowsWithRowIndex_ = () => [];
  gas.appendObject_ = (_sheet: string, row: Record<string, unknown>) => { createdRow = row; };

  gas.upsertInventoryRunRegistry_({
    runId: 'RUN-NEW',
    name: 'New run',
    createdBy: 'Spoofed Creator',
    createdAt: '2026-07-14T00:00:00.000Z',
  }, actor, 'KK - New', [], []);

  assert.ok(createdRow);
  assert.equal(createdRow!['Người tạo'], 'Trusted Creator');
  assert.equal(createdRow!['Tên đăng nhập người tạo'], 'creator');

  gas.getRowsWithRowIndex_ = () => [{
    rowIndex: 3,
    data: {
      RunId: 'RUN-NEW',
      'Người tạo': 'Trusted Creator',
      'Tên đăng nhập người tạo': 'creator',
      'Ngày tạo': '14/07/2026',
    },
  }];
  gas.updateRowByObject_ = (_sheet: string, _row: number, values: Record<string, unknown>) => { updatedRow = values; };
  gas.upsertInventoryRunRegistry_({
    runId: 'RUN-NEW',
    name: 'Updated run',
    createdBy: 'Spoofed Creator',
    createdAt: '2099-01-01T00:00:00.000Z',
  }, actor, 'KK - New', [], []);

  assert.ok(updatedRow);
  assert.equal(updatedRow!['Người tạo'], 'Trusted Creator');
  assert.equal(updatedRow!['Tên đăng nhập người tạo'], 'creator');
  assert.equal(updatedRow!['Ngày tạo'], '14/07/2026');
});

test('security and audit contracts remove plaintext comparisons and log key mutations', () => {
  assert.doesNotMatch(gasSource, /String\(userPin\)\.trim\(\) === pin/);
  assert.doesNotMatch(gasSource, /ScriptApp\.getScriptId\(\) \+ ':' \+ DEVICE_SPREADSHEET_ID/);
  assert.match(gasSource, /hashPin_\(newPin\)/);
  assert.match(gasSource, /'Thêm thiết bị'/);
  assert.match(gasSource, /'Sửa thiết bị'/);
  assert.match(gasSource, /'Báo hỏng'/);
  assert.match(gasSource, /'Cập nhật sửa chữa'/);
  assert.match(gasSource, /'Tạo luân chuyển'/);
  assert.match(gasSource, /'Nhận luân chuyển'/);
  assert.match(gasSource, /'Lưu quy trình vận hành'/);
  assert.match(gasSource, /'Thêm chi phí'/);
  assert.match(gasSource, /'Xóa chi phí'/);
});
