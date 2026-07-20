import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, test } from 'node:test';
import { clearAuthSession, writeAuthSession } from '../src/authSession.ts';
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
}

const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;

beforeEach(() => {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  writeAuthSession({ username: 'admin', token: 'admin-token', role: 'Admin' });
});

afterEach(() => {
  clearAuthSession();
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

test('device documents expose the date they were sent for registration', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({
    success: true,
    data: [{
      'Tên Thiết bị': 'Máy thở',
      'Seri Máy': 'TB-DK-001',
      'Nơi đặt thiết bị': 'Hồi sức',
      documents: [{
        DocumentId: 'DOC-DK-001',
        'Loại tài liệu': 'Đăng kiểm',
        'Trạng thái Hồ sơ': 'Đã gửi',
        'Ngày gửi đăng kiểm': '20/07/2026',
      }],
    }],
  }));

  const { fetchDevices } = await import('../src/services/api.ts');
  const devices = await fetchDevices();

  assert.equal(devices[0]?.documents[0]?.status, 'Đã gửi');
  assert.equal(devices[0]?.documents[0]?.documentId, 'DOC-DK-001');
  assert.equal(
    devices[0]?.documents[0]?.sentDate,
    '20/07/2026',
    'Cần ánh xạ cột Ngày gửi đăng kiểm để người dùng biết hồ sơ đã gửi khi nào.'
  );
});

test('registration actions send an explicit sent date and a dedicated renewal request', async () => {
  const requests: Array<{ action: string; payload: Record<string, unknown> }> = [];
  globalThis.fetch = async (_input, init) => {
    requests.push(JSON.parse(String(init?.body)));
    return new Response(JSON.stringify({ success: true, message: 'OK' }));
  };

  const api = await import('../src/services/api.ts') as typeof import('../src/services/api.ts') & {
    markDocumentSent?: (serial: string, docType: string, sentDate: string) => Promise<unknown>;
    renewDocument?: (payload: {
      documentId: string;
      serial: string;
      docType: string;
      licenseNo: string;
      issuedDate: string;
      expiryDate: string;
    }) => Promise<unknown>;
  };

  assert.equal(
    typeof api.markDocumentSent,
    'function',
    'Thiếu thao tác nhanh đánh dấu hồ sơ đã gửi đăng kiểm.'
  );
  assert.equal(
    typeof api.renewDocument,
    'function',
    'Thiếu API gia hạn riêng để nhập kết quả đăng kiểm mới.'
  );

  await api.markDocumentSent?.('TB-DK-001', 'Đăng kiểm', '20/07/2026');
  await api.renewDocument?.({
    documentId: 'DOC-DK-001',
    serial: 'TB-DK-001',
    docType: 'Đăng kiểm',
    licenseNo: 'DK-2026-002',
    issuedDate: '21/07/2026',
    expiryDate: '21/07/2027',
  });

  assert.deepEqual(requests.map(request => request.action), ['updateDocStatus', 'renewDocument']);
  assert.equal(requests[0]?.payload.status, 'Đã gửi');
  assert.equal(requests[0]?.payload.sentDate, '20/07/2026');
  assert.equal(requests[0]?.payload.docType, 'Đăng kiểm');
  assert.equal(requests[1]?.payload.expiryDate, '21/07/2027');
  assert.equal(requests[1]?.payload.documentId, 'DOC-DK-001');
  requests.forEach(request => assert.equal(request.payload.sessionToken, 'admin-token'));
});

test('renewed historical certificates no longer trigger an expired registration warning', () => {
  const device: DeviceData = {
    id: 'TB-DK-001',
    name: 'Máy thở',
    department: 'Hồi sức',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    documents: [
      {
        documentId: 'DOC-OLD',
        docType: 'Đăng kiểm',
        licenseNo: 'DK-2025-001',
        frequency: '',
        issuedDate: '01/01/2025',
        expiryDate: '01/01/2026',
        prepTime: '30',
        status: 'Đã gia hạn',
        daysUntilExpiry: -200,
      },
      {
        documentId: 'DOC-NEW',
        docType: 'Đăng kiểm',
        licenseNo: 'DK-2026-002',
        frequency: '',
        issuedDate: '20/07/2026',
        expiryDate: '20/07/2027',
        prepTime: '30',
        status: 'Đã phê duyệt',
        daysUntilExpiry: 365,
      },
    ],
  };

  const summary = buildDashboardDeviceSummary([device], [], new Date('2026-07-20T00:00:00+07:00'));

  assert.equal(summary.expiredComplianceCount, 0);
  assert.equal(summary.complianceWarningCount, 0);
});

test('device profile makes sent state and renewal actions visible and convenient', () => {
  const profile = readFileSync('src/pages/DeviceProfile.tsx', 'utf8');

  assert.match(profile, /'add'\s*\|\s*'edit'\s*\|\s*'renew'/);
  assert.match(profile, /doc\.sentDate/);
  assert.match(profile, /Ngày gửi đăng kiểm/);
  assert.match(profile, /Đánh dấu đã gửi/);
  assert.match(profile, /Gia hạn đăng kiểm/);
  assert.match(profile, /markDocumentSent/);
  assert.match(profile, /renewDocument/);
  assert.match(profile, /<option value="Đăng kiểm"\s*\/>/);
  assert.match(profile, /activeTab=\{activeProfileTab\}/);
  assert.match(profile, /onTabChange=\{setActiveProfileTab\}/);
  assert.match(profile, /Loại tài liệu này đã tồn tại/);
});

test('Apps Script persists registration sent dates and handles renewal as an audited action', () => {
  const source = readFileSync('gas/Code.gs', 'utf8');
  const updateStatusBody = source.match(/function updateDocStatus_\(payload, actor\) \{([\s\S]*?)\n\}\n\nfunction addDocument_/)?.[1] || '';
  const aggregateStatusBody = source.match(/function resolveDeviceAggregateStatus_\(device, docs\) \{([\s\S]*?)\n\}\n\nfunction syncDeviceAggregateStatusRow_/)?.[1] || '';

  assert.match(source, /DOCUMENT_HEADERS[\s\S]*?'Ngày gửi đăng kiểm'/);
  assert.match(source, /DOCUMENT_HEADERS[\s\S]*?'DocumentId'/);
  assert.match(source, /case 'renewDocument':[\s\S]*?return renewDocument_\(payload, actor\)/);
  assert.match(updateStatusBody, /payload\.sentDate/);
  assert.match(updateStatusBody, /'Ngày gửi đăng kiểm'/);
  assert.match(source, /function renewDocument_\(payload, actor\)/);
  assert.match(source, /function renewDocument_\(payload, actor\)[\s\S]*?'Hạn đăng kiểm \/ Hạn hiệu lực'/);
  assert.match(source, /function renewDocument_\(payload, actor\)[\s\S]*?'Đã gia hạn'/);
  assert.match(source, /function renewDocument_\(payload, actor\)[\s\S]*?appendObject_\(SHEETS\.documents/);
  assert.match(source, /function renewDocument_\(payload, actor\)[\s\S]*?'Gia hạn đăng kiểm'/);
  assert.match(aggregateStatusBody, /Đã gia hạn/);
});
