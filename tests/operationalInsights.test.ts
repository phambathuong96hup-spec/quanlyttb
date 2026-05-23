import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAuditEvents,
  buildInspectionItems,
  buildInspectionTasks,
  buildRiskScores,
  buildSlaSummary,
  formatCurrencyVnd,
  type WorkflowOverrides,
} from '../src/utils/operationalInsights.ts';
import type { DeviceData, RepairData, TransferData } from '../src/services/api.ts';

const today = new Date('2026-05-23T00:00:00+07:00');

const devices = [
  {
    id: 'TB-001',
    name: 'Máy thở',
    department: 'ICU',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    documents: [
      {
        docType: 'Kiểm định',
        licenseNo: 'KD-01',
        frequency: '',
        issuedDate: '01/05/2025',
        expiryDate: '20/05/2026',
        prepTime: '30',
        status: 'Chưa gửi',
        daysUntilExpiry: null,
        responsible: 'Anh A',
      },
    ],
  },
  {
    id: 'TB-002',
    name: 'Bơm tiêm điện',
    department: 'Khoa Cấp cứu',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    documents: [
      {
        docType: 'Đăng kiểm',
        licenseNo: 'DK-02',
        frequency: '',
        issuedDate: '01/06/2025',
        expiryDate: '10/06/2026',
        prepTime: '20',
        status: 'Chưa gửi',
        daysUntilExpiry: null,
        responsible: 'Chị B',
      },
    ],
  },
  {
    id: 'TB-003',
    name: 'Tủ lạnh bảo quản',
    department: 'Khoa Dược',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    documents: [
      {
        docType: 'Hiệu chuẩn',
        licenseNo: '',
        frequency: '',
        issuedDate: '',
        expiryDate: '',
        prepTime: '30',
        status: 'Chưa gửi',
        daysUntilExpiry: null,
        responsible: 'Anh C',
      },
    ],
  },
  {
    id: 'TB-004',
    name: 'Nhiệt kế',
    department: 'Khoa Dược',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    documents: [
      {
        docType: 'Hiệu chuẩn',
        licenseNo: 'HC-04',
        frequency: '',
        issuedDate: '01/01/2026',
        expiryDate: '01/12/2026',
        prepTime: '15',
        status: 'Đã gửi',
        daysUntilExpiry: null,
      },
    ],
  },
  {
    id: 'TB-005',
    name: 'Bàn inox',
    department: 'Khoa Dược',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    documents: [],
  },
] as DeviceData[];

const repairs = [
  {
    rowId: '10/05/2026',
    deviceId: 'TB-001',
    userName: 'Điều dưỡng A',
    userEmail: 'a@example.com',
    description: 'Lỗi nguồn',
    status: 'Đang sửa chữa',
  },
  {
    rowId: '01/05/2026',
    deviceId: 'TB-002',
    userName: 'Điều dưỡng B',
    userEmail: 'b@example.com',
    description: 'Kẹt nút',
    status: 'Đã hoàn thành',
  },
] as RepairData[];

const transfers = [
  {
    transferId: 'LC-001',
    createdAt: '11/05/2026',
    deviceId: 'TB-002',
    deviceName: 'Bơm tiêm điện',
    fromDepartment: 'Kho',
    toDepartment: 'Khoa Cấp cứu',
    quantity: '1',
    status: 'COMPLETED',
    requestedBy: 'admin',
    requestedByName: 'Admin',
    requestedByEmail: '',
    requestedNote: '',
    requestedAt: '11/05/2026',
    receivedBy: 'user',
    receivedByName: 'User',
    receivedByEmail: '',
    receivedNote: '',
    receivedAt: '12/05/2026',
    rejectedBy: '',
    rejectedAt: '',
    rejectReason: '',
    updatedAt: '12/05/2026',
  },
] as TransferData[];

test('buildInspectionItems classifies expired, warning, missing, and sent documents', () => {
  const items = buildInspectionItems(devices, today);

  assert.equal(items.length, 4);
  assert.equal(items.find(item => item.deviceId === 'TB-001')?.statusKind, 'expired');
  assert.equal(items.find(item => item.deviceId === 'TB-002')?.statusKind, 'warning');
  assert.equal(items.find(item => item.deviceId === 'TB-003')?.statusKind, 'missing');
  assert.equal(items.find(item => item.deviceId === 'TB-004')?.statusKind, 'sent');
  assert.equal(items.find(item => item.deviceId === 'TB-005'), undefined);
});

test('buildInspectionTasks creates actionable tasks and applies workflow overrides', () => {
  const items = buildInspectionItems(devices, today);
  const expired = items.find(item => item.deviceId === 'TB-001');
  assert.ok(expired);

  const workflow: WorkflowOverrides = {
    [expired.taskKey]: {
      status: 'submitted',
      note: 'Đã nộp hồ sơ kiểm định',
      updatedAt: '23/05/2026',
    },
  };
  const tasks = buildInspectionTasks(items, workflow);

  assert.equal(tasks.length, 3);
  assert.equal(tasks.find(task => task.deviceId === 'TB-001')?.workflowStatus, 'submitted');
  assert.equal(tasks.find(task => task.deviceId === 'TB-002')?.priority, 'high');
  assert.equal(tasks.find(task => task.deviceId === 'TB-003')?.priority, 'medium');
});

test('buildRiskScores ranks expired compliance and active repairs above lower-risk devices', () => {
  const items = buildInspectionItems(devices, today);
  const scores = buildRiskScores(devices, repairs, items);

  assert.equal(scores[0].deviceId, 'TB-001');
  assert.ok(scores[0].score > scores.find(score => score.deviceId === 'TB-004')!.score);
  assert.ok(scores[0].reasons.some(reason => reason.includes('hết hạn')));
});

test('buildSlaSummary groups active repair age and department workload', () => {
  const summary = buildSlaSummary(repairs, devices, today);

  assert.equal(summary.activeCount, 1);
  assert.equal(summary.completedCount, 1);
  assert.equal(summary.overSevenDays, 1);
  assert.equal(summary.byDepartment[0].department, 'ICU');
});

test('buildAuditEvents combines repair, transfer, task, and cost activity newest first', () => {
  const items = buildInspectionItems(devices, today);
  const tasks = buildInspectionTasks(items, {});
  const events = buildAuditEvents({
    devices,
    repairs,
    transfers,
    inspectionTasks: tasks,
    costEntries: [
      {
        id: 'cost-1',
        deviceId: 'TB-001',
        date: '22/05/2026',
        amount: 1250000,
        category: 'Sửa chữa',
        vendor: 'Công ty A',
        note: 'Thay nguồn',
      },
    ],
  });

  assert.ok(events.length >= 4);
  assert.equal(events[0].type, 'cost');
  assert.ok(events.some(event => event.type === 'inspection-task'));
});

test('formatCurrencyVnd formats repair costs for operational reports', () => {
  assert.equal(formatCurrencyVnd(1250000), '1.250.000 ₫');
});
