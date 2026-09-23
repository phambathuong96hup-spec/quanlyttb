import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import { buildAttachmentPayloads } from '../src/utils/attachmentUtils.ts';

function createGasContext() {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  const cacheStorage = new Map<string, string>();
  const propsStorage = new Map<string, string>();
  const sheetRows: Record<string, Array<Record<string, unknown>>> = {
    Devices: [
      {
        id: 'TB-TEST-001',
        'Tên Thiết bị': 'Máy theo dõi bệnh nhân',
        'Seri Máy': 'SN-998877',
        'Nơi đặt thiết bị': 'Khoa Hồi sức tích cực',
        'Hiện trạng thực tế': 'Đang sử dụng',
        'Ngày cập nhật': new Date()
      }
    ],
    Repairs: [],
    PendingSync: [],
    EmailOutbox: [],
    ActivityLogs: [],
    IdempotencyKeys: [],
    Documents: []
  };

  const baseContext: Record<string, unknown> = {
    console: {
      log: () => {},
      warn: () => {},
      error: () => {}
    },
    CacheService: {
      getScriptCache: () => ({
        get: (key: string) => cacheStorage.get(key) || null,
        put: (key: string, value: string) => cacheStorage.set(key, String(value)),
        remove: (key: string) => cacheStorage.delete(key)
      })
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (key: string) => propsStorage.get(key) || null,
        setProperty: (key: string, value: string) => propsStorage.set(key, String(value)),
        deleteProperty: (key: string) => propsStorage.delete(key)
      })
    },
    LockService: {
      getScriptLock: () => ({
        tryLock: () => true,
        waitLock: () => true,
        releaseLock: () => {}
      })
    },
    MailApp: {
      sendEmail: () => {}
    },
    SpreadsheetApp: {
      openById: (id?: string) => ({
        getId: () => id || '1fwwIwXpCqhCZzaitYs2__hzfuTNW7mcGAvKl3y_hqZ0',
        getSheetByName: (name: string) => ({
          getName: () => name,
          getLastRow: () => (sheetRows[name]?.length || 0) + 1,
          getLastColumn: () => 10,
          getDataRange: () => ({
            getDisplayValues: () => {
              const rows = sheetRows[name] || [];
              if (rows.length === 0) return [['Id', 'Status', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body']];
              const headers = Object.keys(rows[0] || {});
              return [headers, ...rows.map(r => headers.map(h => String(r[h] ?? '')))];
            }
          }),
          getRange: (row: number) => ({
            getValues: () => {
              const rows = sheetRows[name] || [];
              if (row === 1) {
                return [rows[0] ? Object.keys(rows[0]) : ['Id', 'Status', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body']];
              }
              const target = rows[row - 2] || {};
              return [Object.values(target)];
            },
            getDisplayValues: () => {
              const rows = sheetRows[name] || [];
              if (row === 1) {
                return [rows[0] ? Object.keys(rows[0]) : ['Id', 'Status', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body']];
              }
              const target = rows[row - 2] || {};
              return [Object.values(target).map(String)];
            },
            getDisplayValue: () => 'SC-2026-09-001',
            setValue: () => {},
            setValues: () => {}
          }),
          appendRow: (rowArr: unknown[]) => {
            if (!sheetRows[name]) sheetRows[name] = [];
            const headerRow = sheetRows[name][0] ? Object.keys(sheetRows[name][0]) : [];
            const obj: Record<string, unknown> = {};
            headerRow.forEach((h, idx) => { obj[h] = rowArr[idx] ?? ''; });
            sheetRows[name].push(obj);
          },
          setFrozenRows: () => {}
        })
      }),
      flush: () => {}
    },
    Utilities: {
      getUuid: () => 'uuid-' + Math.random().toString(36).slice(2, 9),
      computeDigest: (_alg: unknown, val: string) => {
        const bytes = [];
        for (let i = 0; i < 32; i++) {
          bytes.push((val.charCodeAt(i % val.length) || 0) % 256);
        }
        return bytes;
      },
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' }
    }
  };

  const context = vm.createContext(baseContext);
  vm.runInContext(gas, context);

  return { context, cacheStorage, propsStorage, sheetRows };
}

test('ensureSchemaVersion_ bypasses 12-sheet checks when version matches, runs migration when version changes', () => {
  const { context, cacheStorage, propsStorage } = createGasContext();

  let setupSheetsCalled = 0;
  context.setupSheets = () => {
    setupSheetsCalled++;
  };

  const currentVersion = context.SCHEMA_VERSION as string;
  assert.ok(currentVersion, 'SCHEMA_VERSION must be defined');
  const defaultSheetId = '1fwwIwXpCqhCZzaitYs2__hzfuTNW7mcGAvKl3y_hqZ0';
  const markerKey = 'SCHEMA_VERSION_' + defaultSheetId;

  // Case 1: Uninitialized -> should run setupSheets, update ScriptProperties and CacheService with spreadsheet-bound key
  const ensureSchemaVersion = context.ensureSchemaVersion_ as (force?: boolean) => boolean;
  const result1 = ensureSchemaVersion();
  assert.equal(result1, true);
  assert.equal(setupSheetsCalled, 1, 'setupSheets should be called on first run');
  assert.equal(propsStorage.get(markerKey), currentVersion);
  assert.equal(cacheStorage.get(markerKey), currentVersion);

  // Case 2: Version already up-to-date in cache -> bypass immediately (0 setupSheets calls)
  setupSheetsCalled = 0;
  const result2 = ensureSchemaVersion();
  assert.equal(result2, true);
  assert.equal(setupSheetsCalled, 0, 'setupSheets must NOT be called when cache matches SCHEMA_VERSION');

  // Case 3: Cache cleared, but ScriptProperties still up-to-date -> warm cache, 0 setupSheets calls
  cacheStorage.clear();
  const result3 = ensureSchemaVersion();
  assert.equal(result3, true);
  assert.equal(setupSheetsCalled, 0, 'setupSheets must NOT be called when ScriptProperties matches SCHEMA_VERSION');
  assert.equal(cacheStorage.get(markerKey), currentVersion, 'Cache should be re-populated');

  // Case 4: Forced migration (e.g. admin action migrateSchema) -> runs setupSheets
  const result4 = ensureSchemaVersion(true);
  assert.equal(result4, true);
  assert.equal(setupSheetsCalled, 1, 'setupSheets must run when force=true');

  // Case 5: Switching to another spreadsheet runs migration for the new spreadsheet ID
  const newSheetId = 'NEW-SPREADSHEET-999';
  const newMarkerKey = 'SCHEMA_VERSION_' + newSheetId;
  context.deviceSpreadsheet_ = () => ({
    getId: () => newSheetId,
    getSheetByName: () => null
  });
  setupSheetsCalled = 0;
  const result5 = ensureSchemaVersion();
  assert.equal(result5, true);
  assert.equal(setupSheetsCalled, 1, 'Changing spreadsheet must trigger migration for new sheet ID');
  assert.equal(propsStorage.get(newMarkerKey), currentVersion);
});

test('reportRepair_ enqueues to EmailOutbox and never calls sendNotificationMail_ synchronously', () => {
  const { context } = createGasContext();

  let directEmailCalled = false;
  context.sendNotificationMail_ = () => {
    directEmailCalled = true;
    return { success: true };
  };
  context.adminEmails_ = () => ['admin@benhvien.vn'];
  context.getDeviceRecipients_ = () => ['admin@benhvien.vn'];

  context.appendRepairAndGetRowId_ = () => {
    return 'SC-2026-09-888';
  };

  context.uploadEvidenceFilesToDrive_ = () => ({
    files: [{ name: 'anh1.jpg', kind: 'Ảnh', url: 'https://drive.mock/anh1.jpg' }],
    failures: []
  });

  const outboxRecords: Array<Record<string, unknown>> = [];
  context.enqueueEmailNotification_ = (task: Record<string, unknown>) => {
    outboxRecords.push(task);
    return { success: true, queued: true, taskId: 'EML-SC-2026-09-888-test' };
  };

  const reportRepair = context.reportRepair_ as (payload: Record<string, unknown>, actor: Record<string, unknown>) => {
    success: boolean;
    emailQueued: boolean;
    repairRowId: string;
    syncStatus: string;
  };

  const payload = {
    deviceId: 'TB-TEST-001',
    description: 'Báo hỏng máy đo huyết áp',
    requestId: 'REQ-OUTBOX-001',
    userName: 'BS. Tuấn',
    userEmail: 'tuan@benhvien.vn'
  };

  const response = reportRepair(payload, { username: 'tuan', name: 'BS. Tuấn', dept: 'Khoa Cấp cứu' });

  assert.equal(response.success, true);
  assert.equal(response.repairRowId, 'SC-2026-09-888');
  assert.equal(response.emailQueued, true, 'Response must confirm email was queued in outbox');
  assert.equal(directEmailCalled, false, 'sendNotificationMail_ must NOT be called in the user submission request');
  assert.equal(outboxRecords.length, 1);
  assert.equal(outboxRecords[0].ticketId, 'SC-2026-09-888');
  assert.equal(outboxRecords[0].requestId, 'REQ-OUTBOX-001');
});

test('enqueueEmailNotification_ creates durable outbox records and deduplicates by RequestId + Event', () => {
  const { context } = createGasContext();
  context.ensureSheet_ = () => {};

  const outboxSheetRows: Array<Record<string, unknown>> = [];
  context.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => {
      if (name === 'EmailOutbox') {
        return {
          getLastRow: () => outboxSheetRows.length + 1,
          getLastColumn: () => 10,
          getDataRange: () => ({
            getDisplayValues: () => {
              if (outboxSheetRows.length === 0) return [['Id', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body', 'Status']];
              return [
                ['Id', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body', 'Status'],
                ...outboxSheetRows.map(r => [
                  r.Id, r.TicketId, r.RequestId, r.Event, r.Recipient, r.Subject, r.Body, r.Status
                ])
              ];
            }
          })
        };
      }
      return null;
    }
  });

  context.appendObject_ = (sheetName: string, obj: Record<string, unknown>) => {
    if (sheetName === 'EmailOutbox') {
      outboxSheetRows.push({ ...obj });
    }
  };

  const enqueue = context.enqueueEmailNotification_ as (task: Record<string, unknown>) => {
    success: boolean;
    queued: boolean;
    deduplicated?: boolean;
    taskId: string;
  };

  // 1. First enqueue for ticket 1
  const res1 = enqueue({
    ticketId: '23/09/2026 08:00:00', // Row display timestamp
    requestId: 'REQ-TICKET-100',
    event: 'reportRepairNotification',
    recipient: ['admin@benhvien.vn'],
    subject: 'Báo hỏng TB-001',
    body: 'Nội dung thông báo'
  });

  assert.equal(res1.success, true);
  assert.equal(res1.queued, true);
  assert.equal(outboxSheetRows.length, 1);
  assert.equal(outboxSheetRows[0].RequestId, 'REQ-TICKET-100');
  assert.equal(outboxSheetRows[0].Status, 'PENDING');
  assert.equal(outboxSheetRows[0].Attempts, 0);

  // 2. Concurrent submission with same display timestamp but DIFFERENT requestId -> MUST NOT deduplicate!
  const res2 = enqueue({
    ticketId: '23/09/2026 08:00:00', // Same display timestamp
    requestId: 'REQ-TICKET-200',     // Different request!
    event: 'reportRepairNotification',
    recipient: ['admin@benhvien.vn'],
    subject: 'Báo hỏng TB-002',
    body: 'Nội dung thông báo'
  });

  assert.equal(res2.success, true);
  assert.equal(res2.deduplicated, undefined);
  assert.equal(outboxSheetRows.length, 2, 'Two independent requests submitted at same time must produce 2 outbox rows');

  // 3. Idempotent re-submission of REQ-TICKET-100 with same event -> deduplicates safely!
  const res3 = enqueue({
    ticketId: '23/09/2026 08:00:00',
    requestId: 'REQ-TICKET-100',
    event: 'reportRepairNotification',
    recipient: ['admin@benhvien.vn'],
    subject: 'Báo hỏng TB-001',
    body: 'Nội dung thông báo'
  });

  assert.equal(res3.success, true);
  assert.equal(res3.deduplicated, true);
  assert.equal(outboxSheetRows.length, 2, 'Duplicate submission of same request must not create extra row');

  // 4. Same request ID but DIFFERENT event -> separate row created!
  const res4 = enqueue({
    ticketId: '23/09/2026 08:00:00',
    requestId: 'REQ-TICKET-100',
    event: 'approvalNotification',
    recipient: ['admin@benhvien.vn'],
    subject: 'Duyệt sửa chữa TB-001',
    body: 'Nội dung thông báo'
  });

  assert.equal(res4.success, true);
  assert.equal(res4.deduplicated, undefined);
  assert.equal(outboxSheetRows.length, 3, 'Different event for same request must create separate notification');
});

test('processEmailOutbox_ claims batch under lock, sends email outside lock, and handles MailApp failure at provider boundary', () => {
  const { context } = createGasContext();

  const outboxRows: Array<Record<string, unknown>> = [
    {
      Id: 'EML-REQ-101-reportRepairNotification',
      TicketId: 'SC-101',
      RequestId: 'REQ-101',
      Event: 'reportRepairNotification',
      Recipient: 'admin@benhvien.vn',
      Subject: 'Subject 1',
      Body: 'Body 1',
      Status: 'PENDING',
      Attempts: '0',
      NextRetryAt: new Date(Date.now() - 10000).toISOString(),
      LastError: '',
      UpdatedAt: new Date(Date.now() - 10000).toISOString()
    },
    {
      Id: 'EML-REQ-102-reportRepairNotification',
      TicketId: 'SC-102',
      RequestId: 'REQ-102',
      Event: 'reportRepairNotification',
      Recipient: 'fail@benhvien.vn',
      Subject: 'Subject 2',
      Body: 'Body 2',
      Status: 'PENDING',
      Attempts: '0',
      NextRetryAt: new Date(Date.now() - 10000).toISOString(),
      LastError: '',
      UpdatedAt: new Date(Date.now() - 10000).toISOString()
    }
  ];

  context.ensureSheet_ = () => {};
  context.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => {
      if (name === 'EmailOutbox') {
        return {
          getLastRow: () => outboxRows.length + 1,
          getLastColumn: () => 12,
          getDataRange: () => ({
            getDisplayValues: () => [
              ['Id', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body', 'Status', 'Attempts', 'NextRetryAt', 'LastError', 'UpdatedAt'],
              ...outboxRows.map(r => [
                r.Id, r.TicketId, r.RequestId, r.Event, r.Recipient, r.Subject, r.Body, r.Status, r.Attempts, r.NextRetryAt, r.LastError, r.UpdatedAt
              ])
            ]
          })
        };
      }
      return null;
    }
  });

  context.updateRowByObject_ = (sheetName: string, rowIndex: number, obj: Record<string, unknown>) => {
    if (sheetName === 'EmailOutbox') {
      const target = outboxRows[rowIndex - 2];
      if (target) Object.assign(target, obj);
    }
  };

  // Mock MailApp at the provider boundary to ensure real sendNotificationMail_ is tested
  const sentEmails: Array<Record<string, unknown>> = [];
  context.MailApp = {
    sendEmail: (mail: { to: string; subject: string; htmlBody: string }) => {
      if (mail.to.includes('fail@benhvien.vn')) {
        throw new Error('Mail quota exceeded');
      }
      sentEmails.push(mail);
    }
  };

  const processOutbox = context.processEmailOutbox_ as (limit?: number) => {
    processed: number;
    sent: number;
    failed: number;
  };

  const result = processOutbox(10);

  assert.equal(result.processed, 2);
  assert.equal(result.sent, 1);
  assert.equal(result.failed, 1);

  // First task succeeded -> SENT
  assert.equal(outboxRows[0].Status, 'SENT');
  assert.equal(outboxRows[0].Attempts, 1);
  assert.equal(sentEmails.length, 1);

  // Second task failed -> RETRY (Attempt 1 < 3), NOT falsely marked SENT!
  assert.equal(outboxRows[1].Status, 'RETRY');
  assert.equal(outboxRows[1].Attempts, 1);
  assert.match(String(outboxRows[1].LastError), /Mail quota exceeded/);
});

test('Lock failure prevents enqueue and schema migration from modifying state', () => {
  const { context } = createGasContext();

  let setupSheetsCount = 0;
  context.setupSheets = () => { setupSheetsCount++; };
  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => false,
      waitLock: () => false,
      releaseLock: () => {}
    })
  };

  const enqueue = context.enqueueEmailNotification_ as (task: Record<string, unknown>) => {
    success: boolean;
    queued: boolean;
    error: string;
  };

  const enqRes = enqueue({
    ticketId: 'SC-999',
    requestId: 'REQ-LOCK-TEST',
    event: 'test',
    recipient: ['admin@benhvien.vn']
  });

  assert.equal(enqRes.success, false);
  assert.equal(enqRes.queued, false);
  assert.equal(enqRes.error, 'LOCK_TIMEOUT');

  const ensureSchema = context.ensureSchemaVersion_ as (force?: boolean) => boolean;
  const migRes = ensureSchema(true);
  assert.equal(migRes, false);
  assert.equal(setupSheetsCount, 0, 'Migration must NOT run when lock acquisition fails');
});

test('processEmailOutbox_ reclaims expired PROCESSING tasks and locates row by Id on row drift', () => {
  const { context } = createGasContext();

  const outboxRows: Array<Record<string, unknown>> = [
    // Pre-existing or newly inserted row shifting indices
    {
      Id: 'EML-DUMMY-SHIFT',
      Status: 'SENT',
      Attempts: '1',
      NextRetryAt: '',
      LastError: '',
      UpdatedAt: new Date().toISOString()
    },
    // The target task was claimed by an interrupted worker > 15 minutes ago
    {
      Id: 'EML-STALE-TASK-001',
      Recipient: 'user@benhvien.vn',
      Subject: 'Stale task',
      Body: 'Body of stale task',
      Status: 'PROCESSING',
      Attempts: '0',
      NextRetryAt: '',
      LastError: '[LEASE:OLD-RUN-CRASHED]',
      UpdatedAt: new Date(Date.now() - 20 * 60 * 1000).toISOString() // 20 mins ago (lease expired)
    }
  ];

  context.ensureSheet_ = () => {};
  context.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => {
      if (name === 'EmailOutbox') {
        return {
          getLastRow: () => outboxRows.length + 1,
          getLastColumn: () => 12,
          getDataRange: () => ({
            getDisplayValues: () => [
              ['Id', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body', 'Status', 'Attempts', 'NextRetryAt', 'LastError', 'UpdatedAt'],
              ...outboxRows.map(r => [
                r.Id, r.TicketId || '', r.RequestId || '', r.Event || '', r.Recipient || '', r.Subject || '', r.Body || '', r.Status, r.Attempts, r.NextRetryAt, r.LastError, r.UpdatedAt
              ])
            ]
          })
        };
      }
      return null;
    }
  });

  context.updateRowByObject_ = (sheetName: string, rowIndex: number, obj: Record<string, unknown>) => {
    if (sheetName === 'EmailOutbox') {
      const target = outboxRows[rowIndex - 2];
      if (target) Object.assign(target, obj);
    }
  };

  const sentList: Array<Record<string, unknown>> = [];
  context.MailApp = {
    sendEmail: (m: Record<string, unknown>) => { sentList.push(m); }
  };

  const processOutbox = context.processEmailOutbox_ as (limit?: number) => {
    processed: number;
    sent: number;
    failed: number;
  };

  const result = processOutbox(10);

  assert.equal(result.processed, 1, 'Should reclaim and process the expired PROCESSING task');
  assert.equal(result.sent, 1);
  assert.equal(sentList.length, 1);
  assert.equal(outboxRows[1].Status, 'SENT');
  assert.equal(outboxRows[1].Attempts, 1);
});

test('setupEmailOutboxTrigger_ is idempotent and strictly enforces valid 5-minute interval', () => {
  const { context } = createGasContext();

  const mockTriggers = [
    {
      getHandlerFunction: () => 'checkComplianceDeadlines',
      getUniqueId: () => 'trig-compliance-001'
    }
  ];

  let requestedInterval: number | null = null;
  let newTriggerCreated = false;
  context.ScriptApp = {
    getProjectTriggers: () => mockTriggers,
    newTrigger: (fnName: string) => ({
      timeBased: () => ({
        everyMinutes: (interval: number) => {
          if (![1, 5, 10, 15, 30].includes(interval)) {
            throw new Error('Invalid interval ' + interval + ' for ClockTriggerBuilder');
          }
          requestedInterval = interval;
          return {
            create: () => {
              newTriggerCreated = true;
              const created = {
                getHandlerFunction: () => fnName,
                getUniqueId: () => 'trig-outbox-999'
              };
              mockTriggers.push(created);
              return created;
            }
          };
        }
      })
    })
  };

  const setupTrigger = context.setupEmailOutboxTrigger_ as () => {
    installed: boolean;
    alreadyExisted: boolean;
    triggerId: string;
  };

  // 1. First run -> creates new trigger with valid 5-minute interval
  const res1 = setupTrigger();
  assert.equal(res1.installed, true);
  assert.equal(res1.alreadyExisted, false);
  assert.equal(newTriggerCreated, true);
  assert.equal(requestedInterval, 5, 'Must use valid 5-minute interval');
  assert.equal(mockTriggers.length, 2, 'Should have compliance trigger + outbox trigger');

  // 2. Second run -> returns existing trigger without creating another one
  newTriggerCreated = false;
  const res2 = setupTrigger();
  assert.equal(res2.installed, true);
  assert.equal(res2.alreadyExisted, true);
  assert.equal(newTriggerCreated, false, 'Must NOT create duplicate trigger');
  assert.equal(mockTriggers.length, 2);
});

test('route_ rejects invalid actions and unauthenticated requests before schema checks', () => {
  const { context } = createGasContext();

  let setupSheetsCalls = 0;
  context.setupSheets = () => { setupSheetsCalls++; };

  const route = context.route_ as (action: string, payload: Record<string, unknown>) => {
    success: boolean;
    message?: string;
  };

  // 1. Invalid action -> returns error without touching schema
  const invalidRes = route('maliciousOrUnknownAction', {});
  assert.equal(invalidRes.success, false);
  assert.match(String(invalidRes.message), /Action không hợp lệ/);
  assert.equal(setupSheetsCalls, 0);

  // 2. Unauthenticated request to protected action -> rejected before schema migration
  const unauthRes = route('getDevices', {});
  assert.equal(unauthRes.success, false);
  assert.equal(setupSheetsCalls, 0);
});

test('buildAttachmentPayloads reports progressive completion and handles order correctly', async () => {
  const makeMockFile = (name: string, type: string, size: number) => ({
    name,
    type,
    size,
    lastModified: 1700000000000,
    arrayBuffer: async () => new ArrayBuffer(size),
    slice: () => new Blob()
  } as unknown as File);

  const files = [
    makeMockFile('hinh-anh-1.jpg', 'image/jpeg', 100),
    makeMockFile('hinh-anh-2.jpg', 'image/jpeg', 150),
    makeMockFile('video-su-co.mp4', 'video/mp4', 500)
  ];

  const progressReports: Array<{ completed: number; total: number }> = [];

  const payloads = await buildAttachmentPayloads(
    files,
    async file => `base64-${file.name}`,
    (completed, total) => {
      progressReports.push({ completed, total });
    },
    2 // Concurrency = 2
  );

  assert.equal(payloads.length, 3);
  assert.equal(payloads[0].name, 'hinh-anh-1.jpg');
  assert.equal(payloads[1].name, 'hinh-anh-2.jpg');
  assert.equal(payloads[2].name, 'video-su-co.mp4');
  assert.equal(progressReports.length, 3);
  assert.deepEqual(progressReports[progressReports.length - 1], { completed: 3, total: 3 });
});

test('reportRepair_ fails gracefully and does not create tickets when upload fails', () => {
  const { context } = createGasContext();

  let appendRepairCalled = false;
  context.appendRepairAndGetRowId_ = () => {
    appendRepairCalled = true;
    return 'SC-SHOULD-NOT-EXIST';
  };

  context.uploadEvidenceFilesToDrive_ = () => ({
    files: [],
    failures: ['Lỗi kết nối Google Drive khi tải anh1.jpg']
  });

  context.discardEvidenceFiles_ = () => {};

  const reportRepair = context.reportRepair_ as (payload: Record<string, unknown>, actor: Record<string, unknown>) => {
    success: boolean;
    attachmentFailures: string[];
    message: string;
  };

  const response = reportRepair(
    { deviceId: 'TB-TEST-001', description: 'Máy hỏng', requestId: 'REQ-FAIL-001' },
    { username: 'user1', name: 'Nhân viên', dept: 'Khoa Ngoại' }
  );

  assert.equal(response.success, false);
  assert.equal(appendRepairCalled, false, 'Must NOT write repair row if evidence upload fails');
  assert.equal(response.attachmentFailures.length, 1);
  assert.match(response.message, /Không thể tải đủ tệp minh chứng/);
});

test('processEmailOutbox_ transitions indeterminate task to UNKNOWN on lease expiry when completion writes fail and never re-delivers', () => {
  const { context } = createGasContext();
  const outboxRows: Array<Record<string, unknown>> = [];

  context.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => {
      if (name === 'EmailOutbox') {
        return {
          getLastRow: () => outboxRows.length + 1,
          getLastColumn: () => 12,
          getDataRange: () => ({
            getDisplayValues: () => {
              const headers = ['Id', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body', 'Status', 'Attempts', 'NextRetryAt', 'LastError', 'UpdatedAt'];
              return [headers, ...outboxRows.map(r => headers.map(h => r[h] instanceof Date ? r[h].toISOString() : String(r[h] ?? '')))];
            }
          })
        };
      }
      return null;
    }
  });

  let originalUpdate = context.updateRowByObject_ as (sheet: string, idx: number, obj: Record<string, unknown>) => void;
  context.updateRowByObject_ = (sheet: string, idx: number, obj: Record<string, unknown>) => {
    if (outboxRows[idx - 2]) {
      Object.assign(outboxRows[idx - 2], obj);
    }
  };
  originalUpdate = context.updateRowByObject_ as (sheet: string, idx: number, obj: Record<string, unknown>) => void;

  outboxRows.push({
    Id: 'EML-TASK-DUP-CHECK',
    TicketId: 'SC-1',
    RequestId: 'REQ-DUP-1',
    Event: 'repair',
    Recipient: 'user@example.com',
    Subject: 'Test',
    Body: 'Body',
    Status: 'PENDING',
    Attempts: 0,
    LastError: '',
    UpdatedAt: new Date()
  });

  let deliverCount = 0;
  context.MailApp = {
    sendEmail: () => { deliverCount++; }
  };

  // Simulate Sheet write failure after mail acceptance (both SENT and fallback SENT_UNCONFIRMED fail)
  context.updateRowByObject_ = (sheet: string, idx: number, obj: Record<string, unknown>) => {
    if (obj.Status === 'SENT' || String(obj.LastError || '').startsWith('SENT_UNCONFIRMED')) {
      throw new Error('Google Sheets quota/network error during status update');
    }
    return originalUpdate(sheet, idx, obj);
  };

  const processEmailOutbox = context.processEmailOutbox_ as () => { processed: number; sent: number; failed: number };
  processEmailOutbox();

  assert.equal(deliverCount, 1, 'First run delivers email');
  assert.equal(outboxRows[0].Status, 'PROCESSING');
  assert.match(String(outboxRows[0].LastError), /\[DISPATCHING:/, 'Task persisted in DISPATCHING phase');

  // Simulate lease expiration (10 minutes) and sheet availability recovery
  outboxRows[0].UpdatedAt = new Date(0);
  context.updateRowByObject_ = originalUpdate;

  // Second run: must NOT re-deliver mail; must transition to UNKNOWN for manual reconciliation
  processEmailOutbox();
  assert.equal(deliverCount, 1, 'Must NOT deliver mail a second time (P1 duplicate guard)');
  assert.equal(outboxRows[0].Status, 'UNKNOWN', 'Ambiguous task must transition to UNKNOWN');
  assert.match(String(outboxRows[0].LastError), /Cần đối soát/);
});

test('route_ propagates LOCK_DENIED on migrateSchema and SCHEMA_NOT_READY on standard actions when lock unavailable', () => {
  const { context } = createGasContext();
  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => false,
      waitLock: () => false,
      releaseLock: () => {}
    })
  };

  const route = context.route_ as (action: string, payload: Record<string, unknown>) => {
    success: boolean;
    error?: string;
    message?: string;
  };

  context.requireAdmin_ = () => ({ username: 'admin', role: 'Admin' });
  context.requireAuthenticated_ = () => ({ username: 'user1', role: 'User' });

  // Test migrateSchema with denied lock
  const migResult = route('migrateSchema', {});
  assert.equal(migResult.success, false);
  assert.equal(migResult.error, 'LOCK_DENIED');
  assert.match(String(migResult.message), /không lấy được khóa/);

  // Test standard action getDevices when schema migration lock cannot be acquired
  const devResult = route('getDevices', {});
  assert.equal(devResult.success, false);
  assert.equal(devResult.error, 'SCHEMA_NOT_READY');
  assert.match(String(devResult.message), /đồng bộ cấu trúc/);
});

test('processEmailOutbox_ stops update when post-send lock fails and never writes without lock', () => {
  const { context } = createGasContext();
  const outboxRows: Array<Record<string, unknown>> = [];

  context.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => {
      if (name === 'EmailOutbox') {
        return {
          getLastRow: () => outboxRows.length + 1,
          getLastColumn: () => 12,
          getDataRange: () => ({
            getDisplayValues: () => {
              const headers = ['Id', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body', 'Status', 'Attempts', 'NextRetryAt', 'LastError', 'UpdatedAt'];
              return [headers, ...outboxRows.map(r => headers.map(h => r[h] instanceof Date ? r[h].toISOString() : String(r[h] ?? '')))];
            }
          })
        };
      }
      return null;
    }
  });

  outboxRows.push({
    Id: 'EML-TASK-POSTLOCK-FAIL',
    TicketId: 'SC-2',
    RequestId: 'REQ-POSTLOCK-1',
    Event: 'repair',
    Recipient: 'user@example.com',
    Subject: 'Test',
    Body: 'Body',
    Status: 'PENDING',
    Attempts: 0,
    LastError: '',
    UpdatedAt: new Date()
  });

  let lockAttempts = 0;
  let held = false;
  let unlockedWrites = 0;
  let delivered = 0;

  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        lockAttempts++;
        held = lockAttempts < 3; // attempt 1 (batch): true, attempt 2 (pre-send): true, attempt 3 (post-send): false
        return held;
      },
      releaseLock: () => { held = false; }
    })
  };

  context.MailApp = {
    sendEmail: () => { delivered++; }
  };

  context.updateRowByObject_ = (sheet: string, idx: number, obj: Record<string, unknown>) => {
    if (!held) unlockedWrites++;
    if (outboxRows[idx - 2]) {
      Object.assign(outboxRows[idx - 2], obj);
    }
  };

  const processEmailOutbox = context.processEmailOutbox_ as () => { processed: number; sent: number; failed: number };
  processEmailOutbox();

  assert.equal(lockAttempts, 3, 'All 3 lock phases attempted');
  assert.equal(unlockedWrites, 0, 'Zero writes allowed without holding lock');
  assert.equal(delivered, 1, 'Email was delivered');
  assert.equal(outboxRows[0].Status, 'PROCESSING', 'Row remains PROCESSING because post-send update was halted safely');
  assert.match(String(outboxRows[0].LastError), /\[DISPATCHING:/, 'Remains marked as DISPATCHING');

  // Simulate lease expiry (10 minutes)
  outboxRows[0].UpdatedAt = new Date(0);
  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => true,
      releaseLock: () => {}
    })
  };
  held = true;

  // Next worker run must transition to UNKNOWN, NOT re-send email
  processEmailOutbox();
  assert.equal(delivered, 1, 'Email must NOT be delivered twice');
  assert.equal(outboxRows[0].Status, 'UNKNOWN', 'Ambiguous task must transition to UNKNOWN');
});

test('processEmailOutbox_ stops update when post-send lock throws exception and avoids duplicate delivery', () => {
  const { context } = createGasContext();
  const outboxRows: Array<Record<string, unknown>> = [];

  context.deviceSpreadsheet_ = () => ({
    getSheetByName: (name: string) => {
      if (name === 'EmailOutbox') {
        return {
          getLastRow: () => outboxRows.length + 1,
          getLastColumn: () => 12,
          getDataRange: () => ({
            getDisplayValues: () => {
              const headers = ['Id', 'TicketId', 'RequestId', 'Event', 'Recipient', 'Subject', 'Body', 'Status', 'Attempts', 'NextRetryAt', 'LastError', 'UpdatedAt'];
              return [headers, ...outboxRows.map(r => headers.map(h => r[h] instanceof Date ? r[h].toISOString() : String(r[h] ?? '')))];
            }
          })
        };
      }
      return null;
    }
  });

  outboxRows.push({
    Id: 'EML-TASK-POSTLOCK-ERR',
    TicketId: 'SC-3',
    RequestId: 'REQ-POSTLOCK-ERR-1',
    Event: 'repair',
    Recipient: 'user@example.com',
    Subject: 'Test',
    Body: 'Body',
    Status: 'PENDING',
    Attempts: 0,
    LastError: '',
    UpdatedAt: new Date()
  });

  let lockAttempts = 0;
  let held = false;
  let unlockedWrites = 0;
  let delivered = 0;

  context.LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        lockAttempts++;
        if (lockAttempts === 3) throw new Error('Lock service transient failure');
        held = true;
        return true;
      },
      releaseLock: () => { held = false; }
    })
  };

  context.MailApp = {
    sendEmail: () => { delivered++; }
  };

  context.updateRowByObject_ = (sheet: string, idx: number, obj: Record<string, unknown>) => {
    if (!held) unlockedWrites++;
    if (outboxRows[idx - 2]) {
      Object.assign(outboxRows[idx - 2], obj);
    }
  };

  const processEmailOutbox = context.processEmailOutbox_ as () => { processed: number; sent: number; failed: number };
  processEmailOutbox();

  assert.equal(lockAttempts, 3);
  assert.equal(unlockedWrites, 0, 'Zero writes allowed when postLock throws');
  assert.equal(delivered, 1);
  assert.equal(outboxRows[0].Status, 'PROCESSING');
  assert.match(String(outboxRows[0].LastError), /\[DISPATCHING:/);
});


