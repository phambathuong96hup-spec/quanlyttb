import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import {
  isValidDayInMonth,
  isValidVietnameseDate,
  isValidFlexibleDate,
  parseVietnameseDate,
  parseFlexibleDate,
} from '../src/utils/dateUtils.ts';

test('dateUtils strictly rejects rollover dates and invalid calendar dates', () => {
  // Leap year checks
  assert.equal(isValidDayInMonth(2024, 2, 29), true);
  assert.equal(isValidDayInMonth(2025, 2, 29), false); // non-leap year
  assert.equal(isValidDayInMonth(2026, 2, 29), false);
  assert.equal(isValidDayInMonth(2026, 2, 30), false);
  assert.equal(isValidDayInMonth(2026, 2, 31), false);

  // 30-day months cannot have day 31
  assert.equal(isValidDayInMonth(2026, 4, 31), false); // April
  assert.equal(isValidDayInMonth(2026, 6, 31), false); // June
  assert.equal(isValidDayInMonth(2026, 9, 31), false); // September
  assert.equal(isValidDayInMonth(2026, 11, 31), false); // November

  // 31-day months
  assert.equal(isValidDayInMonth(2026, 1, 31), true);
  assert.equal(isValidDayInMonth(2026, 3, 31), true);
  assert.equal(isValidDayInMonth(2026, 5, 31), true);
  assert.equal(isValidDayInMonth(2026, 7, 31), true);
  assert.equal(isValidDayInMonth(2026, 8, 31), true);
  assert.equal(isValidDayInMonth(2026, 10, 31), true);
  assert.equal(isValidDayInMonth(2026, 12, 31), true);

  // Month out of bounds
  assert.equal(isValidDayInMonth(2026, 0, 15), false);
  assert.equal(isValidDayInMonth(2026, 13, 15), false);
  assert.equal(isValidDayInMonth(2026, 5, 0), false);
  assert.equal(isValidDayInMonth(2026, 5, 32), false);

  // Vietnamese format validation
  assert.equal(isValidVietnameseDate('15/05/2026'), true);
  assert.equal(isValidVietnameseDate('31/02/2026'), false);
  assert.equal(isValidVietnameseDate('29/02/2025'), false);
  assert.equal(isValidVietnameseDate('29/02/2024'), true);
  assert.equal(isValidVietnameseDate('31/04/2026'), false);
  assert.equal(isValidVietnameseDate('not-a-date'), false);
  assert.equal(isValidVietnameseDate(''), false);

  // Flexible format validation
  assert.equal(isValidFlexibleDate('2026-05-15'), true);
  assert.equal(isValidFlexibleDate('2026-02-31'), false);
  assert.equal(isValidFlexibleDate('2025-02-29'), false);
  assert.equal(isValidFlexibleDate('2024-02-29'), true);
  assert.equal(isValidFlexibleDate('2026-04-31'), false);

  // Parsing
  const parsedValid = parseVietnameseDate('15/05/2026');
  assert.ok(parsedValid !== null);
  assert.equal(parsedValid!.getDate(), 15);
  assert.equal(parsedValid!.getMonth(), 4); // May
  assert.equal(parsedValid!.getFullYear(), 2026);

  assert.equal(parseVietnameseDate('31/02/2026'), null);
  assert.equal(parseVietnameseDate('29/02/2025'), null);
  assert.equal(parseFlexibleDate('2026-02-31'), null);
  assert.equal(parseFlexibleDate('invalid'), null);
});

test('gas/Code.gs parseDate_ and isValidDateString_ reject rollover dates', () => {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  const context: Record<string, unknown> = {
    console: { ...console },
  };

  vm.runInNewContext(
    `${gas}\n
    globalThis.__parseDate = parseDate_;
    globalThis.__isValidDate = isValidDateString_;
    globalThis.__isLeap = isLeapYear_;
    globalThis.__daysInMonth = getDaysInMonth_;
    `,
    context
  );

  const parseDate = context.__parseDate as (s: string) => Date;
  const isValidDate = context.__isValidDate as (s: string) => boolean;

  // Leap year
  assert.equal(isValidDate('29/02/2024'), true);
  assert.equal(isValidDate('29/02/2025'), false);

  // Rollover dates must be invalid
  assert.equal(isValidDate('31/02/2026'), false);
  assert.equal(isValidDate('31/04/2026'), false);
  assert.equal(isValidDate('31/06/2026'), false);
  assert.equal(isValidDate('31/09/2026'), false);
  assert.equal(isValidDate('31/11/2026'), false);

  assert.ok(isNaN(parseDate('31/02/2026').getTime()));
  assert.ok(isNaN(parseDate('31/04/2026').getTime()));
  assert.ok(isNaN(parseDate('2026-02-31').getTime()));

  // Strict full-string matching: trailing garbage must be rejected
  assert.equal(isValidDate('2026-05-15-invalid'), false);
  assert.equal(isValidDate('15/05/2026Extra'), false);
  assert.ok(isNaN(parseDate('2026-05-15-invalid').getTime()));

  // Valid dates
  assert.equal(isValidDate('15/05/2026'), true);
  assert.equal(isValidDate('2026-05-15'), true);
  assert.ok(!isNaN(parseDate('15/05/2026').getTime()));
  assert.ok(!isNaN(parseDate('2026-05-15').getTime()));

  // Valid ISO instant with timezone offset (e.g. +14:00)
  assert.equal(isValidDate('2026-01-01T00:30:00+14:00'), true);
  assert.ok(!isNaN(parseDate('2026-01-01T00:30:00+14:00').getTime()));

  // Valid date beyond arbitrary year 2100
  assert.equal(isValidDate('2150-05-15'), true);
  assert.ok(!isNaN(parseDate('2150-05-15').getTime()));
});

test('gas/Code.gs pre-write date validation rejects invalid dates in addDocument, renewDocument, updateDocStatus, addCostEntry', () => {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  const context: Record<string, unknown> = {
    console: { ...console },
    SpreadsheetApp: {
      openById: () => ({
        getSheetByName: () => ({
          getDataRange: () => ({
            getDisplayValues: () => [['id', 'Seri Máy', 'Tên Thiết bị'], ['TB-001', 'SN001', 'Máy đo']],
            getValues: () => [['id', 'Seri Máy', 'Tên Thiết bị'], ['TB-001', 'SN001', 'Máy đo']],
          }),
        }),
      }),
    },
    SHEETS: {
      devices: 'Devices',
      documents: 'Documents',
      costEntries: 'CostEntries',
      logs: 'ActivityLogs',
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        releaseLock: () => {},
      }),
    },
    Utilities: {
      getUuid: () => 'CP-test-uuid',
      formatDate: (dt: Date) => dt.toISOString(),
    },
  };

  const vmContext = vm.createContext(context);
  vm.runInContext(
    `${gas}\n
    globalThis.__addDoc = addDocument_;
    globalThis.__renewDoc = renewDocument_;
    globalThis.__updateDoc = updateDocStatus_;
    globalThis.__addCost = addCostEntry_;
    `,
    vmContext
  );

  // Re-assign mocks AFTER vm load so any hoisted function declarations do not overwrite them
  vmContext.getRows_ = (sheetName: string) => {
    if (sheetName === 'Devices') {
      return [{ id: 'TB-001', 'Seri Máy': 'SN001', 'Tên Thiết bị': 'Máy đo' }];
    }
    if (sheetName === 'Documents') {
      return [{ DeviceId: 'TB-001', 'Loại tài liệu': 'Kiểm định', 'Số văn bản / Số Đăng kiểm': 'KD-01', 'Hạn đăng kiểm / Hạn hiệu lực': '15/05/2026' }];
    }
    if (sheetName === 'CostEntries') return [];
    return [];
  };
  vmContext.findDeviceRow_ = (id: string) => (id === 'TB-001' ? 2 : -1);
  vmContext.appendObject_ = () => {};
  vmContext.logActivity_ = () => {};
  vmContext.documentMutationLock_ = () => ({ tryLock: () => true, releaseLock: () => {} });

  const addDoc = vmContext.__addDoc as (payload: Record<string, unknown>, actor: unknown) => { success: boolean; message: string };
  const renewDoc = vmContext.__renewDoc as (payload: Record<string, unknown>, actor: unknown) => { success: boolean; message: string };
  const addCost = vmContext.__addCost as (payload: Record<string, unknown>, actor: unknown) => { success: boolean; message: string };

  const fakeAdmin = {
    username: 'admin',
    'Tên đăng nhập': 'admin',
    'Quyền hạn': 'admin',
    'Khoa/Phòng': 'Vật tư',
  };

  // addDocument rejects 31/02/2026
  const res1 = addDoc({ serial: 'TB-001', docType: 'Kiểm định', expiryDate: '31/02/2026' }, fakeAdmin);
  assert.equal(res1.success, false);
  assert.match(res1.message, /Hạn đăng kiểm \/ Hạn hiệu lực không hợp lệ/);

  // renewDocument rejects 31/04/2026
  const res2 = renewDoc({ serial: 'TB-001', expiryDate: '31/04/2026' }, fakeAdmin);
  assert.equal(res2.success, false);
  assert.match(res2.message, /Hạn đăng kiểm mới không hợp lệ/);

  // addCostEntry rejects invalid date
  const res3 = addCost({ deviceId: 'TB-001', amount: 500000, date: '31/02/2026' }, fakeAdmin);
  assert.equal(res3.success, false);
  assert.match(res3.message, /Ngày chi phí không hợp lệ/);
});
