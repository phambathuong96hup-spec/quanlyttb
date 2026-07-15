import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import {
  clearAuthSession,
  readAuthSession,
  writeAuthSession,
} from '../src/authSession.ts';
import { buildDashboardDeviceSummary } from '../src/utils/dashboardDeviceStats.ts';
import type { DeviceData } from '../src/services/api.ts';

class MemoryStorage {
  #values = new Map<string, string>();

  getItem(key: string) {
    return this.#values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.#values.set(key, String(value));
  }

  removeItem(key: string) {
    this.#values.delete(key);
  }

  clear() {
    this.#values.clear();
  }
}

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
const originalConsoleWarn = console.warn;

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
});

afterEach(() => {
  clearAuthSession();
  globalThis.fetch = originalFetch;
  console.warn = originalConsoleWarn;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

test('auth restoration rejects legacy username-only sessions without a server token', () => {
  sessionStorage.setItem('qlttb.auth', JSON.stringify({
    username: 'legacy-user',
    role: 'User',
    name: 'Legacy User',
  }));

  const restored = readAuthSession();

  assert.equal(restored.isAuthenticated, false);
  assert.equal(sessionStorage.getItem('qlttb.auth'), null);
});

test('auth restoration accepts a non-expired tokenized session', () => {
  const written = writeAuthSession({
    username: 'operator',
    token: 'session-token',
    role: 'Admin',
    expiresAt: Date.now() + 60_000,
  });

  const restored = readAuthSession();

  assert.equal(written.isAuthenticated, true);
  assert.equal(restored.isAuthenticated, true);
  assert.equal(restored.token, 'session-token');
  assert.equal(restored.isAdmin, true);
});

test('device reads use authenticated POST and never require the local snapshot module by default', async () => {
  writeAuthSession({ username: 'operator', token: 'session-token', role: 'User' });
  let request: RequestInit | undefined;
  globalThis.fetch = async (_input, init) => {
    request = init;
    return new Response(JSON.stringify({
      success: true,
      data: [{ 'Tên Thiết bị': 'Máy thở', 'Seri Máy': 'TB-001', 'Nơi đặt thiết bị': 'ICU' }],
    }));
  };

  const { fetchDevices } = await import('../src/services/api.ts');
  const devices = await fetchDevices();
  const body = JSON.parse(String(request?.body));

  assert.equal(request?.method, 'POST');
  assert.equal(body.action, 'getDevices');
  assert.equal(body.payload.actorUsername, 'operator');
  assert.equal(body.payload.sessionToken, 'session-token');
  assert.equal(devices[0]?.id, 'TB-001');
});

test('an invalid API session clears storage and announces logout', async () => {
  writeAuthSession({ username: 'operator', token: 'expired-token', role: 'User' });
  let invalidEvents = 0;
  window.addEventListener('qlttb:session-invalid', () => { invalidEvents += 1; });
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: false,
    message: 'Phiên đăng nhập đã hết hạn.',
  }));
  console.warn = () => undefined;

  const { fetchDevices } = await import('../src/services/api.ts');

  await assert.rejects(fetchDevices(), /Phiên đăng nhập đã hết hạn/);
  assert.equal(sessionStorage.getItem('qlttb.auth'), null);
  assert.equal(invalidEvents, 1);
});

test('operational and inventory API contracts stay typed and use authenticated actions', async () => {
  writeAuthSession({ username: 'admin', token: 'admin-token', role: 'Admin' });
  const actions: Array<{ action: string; payload: Record<string, unknown> }> = [];
  globalThis.fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    actions.push(body);
    const data = body.action === 'getOperationalState'
      ? { workflowOverrides: {}, costEntries: [] }
      : body.action === 'getInventoryRuns'
        ? [{ runId: 'KK-1', name: 'Tháng 7', scannedCount: 5 }]
        : undefined;
    return new Response(JSON.stringify({ success: true, data, message: 'OK' }));
  };

  const api = await import('../src/services/api.ts');
  const state = await api.fetchOperationalState();
  const runs = await api.fetchInventoryRuns();
  await api.saveWorkflowOverride({ taskKey: 'task-1', status: 'preparing', note: 'Đang làm' });
  await api.addCostEntry({ id: 'cost-1', deviceId: 'TB-1', date: '14/07/2026', amount: 1000, category: 'Bảo trì', vendor: 'A', note: '' });
  await api.deleteCostEntry({ id: 'cost-1' });

  assert.deepEqual(state, { workflowOverrides: {}, costEntries: [] });
  assert.equal(runs[0]?.runId, 'KK-1');
  assert.deepEqual(actions.map(item => item.action), [
    'getOperationalState',
    'getInventoryRuns',
    'saveWorkflowOverride',
    'addCostEntry',
    'deleteCostEntry',
  ]);
  actions.forEach(item => assert.equal(item.payload.sessionToken, 'admin-token'));
});

test('legacy Operations data becomes pending without duplicating entries already confirmed by server', async () => {
  const api = await import('../src/services/api.ts');
  const confirmedCost = {
    id: 'cost-confirmed',
    deviceId: 'TB-1',
    date: '13/07/2026',
    amount: 500,
    category: 'Bảo trì',
    vendor: 'A',
    note: '',
  };
  const localOnlyCost = { ...confirmedCost, id: 'cost-local', amount: 900 };

  const plan = api.buildOperationalMigrationPlan(
    {
      workflowOverrides: {
        'task-local': { status: 'preparing', note: 'Dữ liệu cũ trên máy' },
      },
      costEntries: [localOnlyCost, confirmedCost],
    },
    {
      workflowOverrides: {},
      costEntries: [confirmedCost],
    }
  );

  assert.equal(plan.workflowOverrides['task-local']?.note, 'Dữ liệu cũ trên máy');
  assert.deepEqual(plan.costEntries.map(entry => entry.id), ['cost-local', 'cost-confirmed']);
  assert.deepEqual(plan.pendingOperations.map(operation => operation.type), ['workflow', 'add-cost']);
  assert.equal(
    plan.pendingOperations.filter(operation => operation.type === 'add-cost').length,
    1
  );
});

test('frontend pages expose synchronized state, independent errors, and bounded selectors', () => {
  const api = readFileSync('src/services/api.ts', 'utf8');
  const authProvider = readFileSync('src/AuthProvider.tsx', 'utf8');
  const operations = readFileSync('src/pages/Operations.tsx', 'utf8');
  const inventory = readFileSync('src/pages/InventoryQr.tsx', 'utf8');
  const profile = readFileSync('src/pages/DeviceProfile.tsx', 'utf8');
  const transfers = readFileSync('src/pages/Transfers.tsx', 'utf8');
  const repair = readFileSync('src/pages/RepairRequest.tsx', 'utf8');

  assert.doesNotMatch(api, /^import devicesSnapshot/m);
  assert.match(api, /import\('\.\.\/data\/devices\.snapshot\.json'\)/);
  assert.match(authProvider, /SESSION_INVALID_EVENT/);
  assert.match(authProvider, /addEventListener\(SESSION_INVALID_EVENT/);

  assert.match(operations, /fetchOperationalState/);
  assert.match(operations, /saveWorkflowOverride/);
  assert.match(operations, /addCostEntry/);
  assert.match(operations, /deleteCostEntry/);
  assert.match(operations, /buildOperationalMigrationPlan/);
  assert.match(operations, /writeStorage\(PENDING_KEY, migration\.pendingOperations\)/);
  assert.match(operations, /const pendingDeleteIds/);
  assert.match(operations, /filter\(entry => !pendingDeleteIds\.has\(entry\.id\)\)/);
  assert.match(operations, /pending/i);
  assert.match(operations, /Đã đồng bộ|Chưa đồng bộ|Lỗi đồng bộ/);
  assert.match(operations, /Hết hạn đăng kiểm/);
  assert.doesNotMatch(operations, /Trạng thái quy trình hồ sơ và chi phí đang được lưu nội bộ/);

  assert.match(inventory, /fetchInventoryRuns/);
  assert.match(inventory, /mergeInventoryRunHistory/);
  assert.match(inventory, /Đang tải lịch sử|Không tải được lịch sử/);

  assert.doesNotMatch(profile, /const isLoading = isDevicesLoading \|\| isTransfersLoading \|\| isRepairsLoading/);
  assert.match(profile, /isDevicesLoading/);
  assert.match(profile, /transfersError/);
  assert.match(profile, /repairsError/);
  assert.match(profile, /Thử lại/);

  assert.doesNotMatch(transfers, /setDeviceType\(borrowDeviceTypes\[0\]\)/);
  assert.doesNotMatch(transfers, /return first\.id/);
  assert.match(transfers, /const isTransferFormValid/);
  assert.match(transfers, /disabled=\{isSaving \|\| !isTransferFormValid\}/);
  assert.doesNotMatch(transfers, /isTransferFormValid[^;]*transferRecommendations\.length/);

  assert.match(repair, /deviceSearch/);
  assert.match(repair, /MAX_DEVICE_OPTIONS/);
  assert.match(repair, /slice\(0, MAX_DEVICE_OPTIONS\)/);
  assert.match(repair, /<option value="" disabled>-- Chọn thiết bị --<\/option>/);
});

test('Operations uses the same device-level expired registration KPI as Dashboard', () => {
  const device: DeviceData = {
    id: 'TB-MULTI-DOC',
    name: 'Máy có nhiều hồ sơ',
    department: 'ICU',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    documents: [
      { docType: 'Đăng kiểm', licenseNo: 'DK-1', frequency: '', issuedDate: '', expiryDate: '01/01/2025', prepTime: '30', status: 'Đã gửi', daysUntilExpiry: -10 },
      { docType: 'Hiệu chuẩn', licenseNo: 'HC-1', frequency: '', issuedDate: '', expiryDate: '01/02/2025', prepTime: '30', status: 'Chưa gửi', daysUntilExpiry: -5 },
    ],
  };

  const dashboardSummary = buildDashboardDeviceSummary([device], [], new Date('2026-07-14T00:00:00+07:00'));
  const operations = readFileSync('src/pages/Operations.tsx', 'utf8');

  assert.equal(dashboardSummary.expiredComplianceCount, 1);
  assert.match(operations, /buildDashboardDeviceSummary/);
  assert.match(operations, /expired:\s*deviceSummary\.expiredComplianceCount/);
  assert.match(operations, /warning:\s*deviceSummary\.complianceWarningCount/);
  assert.match(operations, /<span>Cảnh báo đăng kiểm<\/span>/);
  assert.doesNotMatch(operations, /<span>Cần chuẩn bị hồ sơ<\/span>/);
});
