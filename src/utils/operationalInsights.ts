import type { DeviceData, DeviceDocument, RepairData, TransferData } from '../services/api';
import { parseFlexibleDate } from './dateUtils.ts';
import { removeVietnameseTones } from './stringUtils.ts';

export type ComplianceStatusKind = 'expired' | 'warning' | 'missing' | 'sent' | 'valid';
export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';
export type WorkflowStatus = 'todo' | 'preparing' | 'submitted' | 'approved' | 'returned';
export type AuditEventType = 'device' | 'repair' | 'transfer' | 'inspection-task' | 'cost';

export interface WorkflowOverride {
  status: WorkflowStatus;
  note?: string;
  updatedAt?: string;
}

export type WorkflowOverrides = Record<string, WorkflowOverride>;

export interface InspectionItem {
  taskKey: string;
  deviceId: string;
  deviceName: string;
  department: string;
  docType: string;
  licenseNo: string;
  issuedDate: string;
  expiryDate: string;
  prepTime: string;
  responsible: string;
  daysUntilExpiry: number | null;
  prepDays: number;
  statusKind: ComplianceStatusKind;
  statusText: string;
  priority: TaskPriority;
  needsAction: boolean;
}

export interface InspectionTask extends InspectionItem {
  workflowStatus: WorkflowStatus;
  workflowLabel: string;
  note: string;
  updatedAt: string;
}

export interface CostEntry {
  id: string;
  deviceId: string;
  date: string;
  amount: number;
  category: string;
  vendor: string;
  note: string;
}

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  date: string;
  deviceId: string;
  title: string;
  description: string;
  actor: string;
}

const EMPTY_TEXT = '—';

const cleanText = (value: unknown, fallback = EMPTY_TEXT) => {
  const text = String(value ?? '').trim();
  const normalized = removeVietnameseTones(text.toLowerCase());
  if (!text || normalized === 'n/a' || normalized === 'na' || normalized === 'khong co' || normalized === '-') {
    return fallback;
  }
  return text;
};

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const differenceInDays = (from: Date, to: Date) => {
  const start = startOfDay(from).getTime();
  const end = startOfDay(to).getTime();
  return Math.round((end - start) / 86400000);
};

const daysFromToday = (dateText: string, today: Date) => {
  const parsed = parseFlexibleDate(dateText);
  return parsed ? differenceInDays(today, parsed) : null;
};

const normalizeStatus = (status: string) => removeVietnameseTones(status.toLowerCase());

const isSentOrApproved = (status: string) => {
  const normalized = normalizeStatus(status);
  return normalized.includes('da gui') || normalized.includes('da phe duyet');
};

const parsePrepDays = (value: string) => {
  const match = value.match(/\d+/);
  return match ? Number(match[0]) : 30;
};

const makeTaskKey = (deviceId: string, docType: string, licenseNo: string, expiryDate: string, index: string | number) => {
  return [deviceId, docType, licenseNo, expiryDate, index]
    .map(part => removeVietnameseTones(String(part || 'none')).replace(/[^\w-]+/g, '_'))
    .join('__');
};

const resolveCompliance = (
  docStatus: string,
  expiryDate: string,
  daysUntilExpiry: number | null
): Pick<InspectionItem, 'statusKind' | 'statusText' | 'priority' | 'needsAction'> => {
  if (isSentOrApproved(docStatus)) {
    return {
      statusKind: 'sent',
      statusText: docStatus,
      priority: 'low',
      needsAction: false,
    };
  }

  if (!expiryDate || daysUntilExpiry === null) {
    return {
      statusKind: 'missing',
      statusText: 'Thiếu hồ sơ',
      priority: 'medium',
      needsAction: true,
    };
  }

  if (daysUntilExpiry < 0) {
    return {
      statusKind: 'expired',
      statusText: `Hồ sơ hết hạn ${Math.abs(daysUntilExpiry)} ngày`,
      priority: 'critical',
      needsAction: true,
    };
  }

  if (daysUntilExpiry <= 30) {
    return {
      statusKind: 'warning',
      statusText: `Còn ${daysUntilExpiry} ngày`,
      priority: 'high',
      needsAction: true,
    };
  }

  return {
    statusKind: 'valid',
    statusText: `Còn ${daysUntilExpiry} ngày`,
    priority: 'low',
    needsAction: false,
  };
};

const buildDocumentInspectionItem = (
  device: DeviceData,
  doc: DeviceDocument,
  index: number,
  deviceIndex: number,
  today: Date
): InspectionItem => {
  const docType = cleanText(doc.docType, 'Hồ sơ kiểm định');
  const licenseNo = cleanText(doc.licenseNo);
  const issuedDate = cleanText(doc.issuedDate, '');
  const expiryDate = cleanText(doc.expiryDate, '');
  const prepTime = cleanText(doc.prepTime, '30');
  const daysUntilExpiry = typeof doc.daysUntilExpiry === 'number'
    ? doc.daysUntilExpiry
    : daysFromToday(expiryDate, today);
  const docStatus = cleanText(doc.status, 'Chưa gửi');
  const compliance = resolveCompliance(docStatus, expiryDate, daysUntilExpiry);

  return {
    taskKey: makeTaskKey(device.id, docType, licenseNo, expiryDate, `${deviceIndex}-${index}`),
    deviceId: device.id,
    deviceName: device.name,
    department: cleanText(device.department, 'Chưa phân bổ'),
    docType,
    licenseNo,
    issuedDate: cleanText(issuedDate),
    expiryDate: cleanText(expiryDate),
    prepTime,
    responsible: cleanText(doc.responsible),
    daysUntilExpiry,
    prepDays: parsePrepDays(prepTime),
    ...compliance,
  };
};

const buildLegacyInspectionItem = (device: DeviceData, index: number, today: Date): InspectionItem | null => {
  const issuedDate = cleanText(device['Ngày cấp/ Ngày Đăng kiểm'], '');
  const expiryDate = cleanText(
    device['Thời hạn cấp lại/ Hạn đăng kiểm'] || device['Hạn đăng kiểm'] || device['Ngày bảo dưỡng tiếp theo'],
    ''
  );
  const licenseNo = cleanText(device['Số văn bản / Số Đăng kiểm'] || device['Số đăng kiểm'], '');
  const rawDocStatus = cleanText(device['Trạng thái Hồ sơ'], '');
  const hasLegacyInspectionData = Boolean(issuedDate || expiryDate || licenseNo || rawDocStatus);
  if (!hasLegacyInspectionData) return null;

  const prepTime = cleanText(device['Thời gian  chuẩn bị Hồ sơ'] || device['Thời gian chuẩn bị Hồ sơ'], '30');
  const docStatus = rawDocStatus || 'Chưa gửi';
  const daysUntilExpiry = daysFromToday(expiryDate, today);
  const compliance = resolveCompliance(docStatus, expiryDate, daysUntilExpiry);

  return {
    taskKey: makeTaskKey(device.id, 'legacy', '', expiryDate, index),
    deviceId: device.id,
    deviceName: device.name,
    department: cleanText(device.department, 'Chưa phân bổ'),
    docType: issuedDate || expiryDate ? 'Đăng kiểm / bảo dưỡng' : 'Hồ sơ theo dõi',
    licenseNo: cleanText(licenseNo),
    issuedDate: cleanText(issuedDate),
    expiryDate: cleanText(expiryDate),
    prepTime,
    responsible: cleanText(device['Người chịu trách nhiệm']),
    daysUntilExpiry,
    prepDays: parsePrepDays(prepTime),
    ...compliance,
  };
};

export const buildInspectionItems = (devices: DeviceData[], today = new Date()): InspectionItem[] => {
  return devices.flatMap((device, deviceIndex) => {
    const docs = device.documents || [];
    if (docs.length === 0) {
      const legacyItem = buildLegacyInspectionItem(device, deviceIndex, today);
      return legacyItem ? [legacyItem] : [];
    }
    return docs.map((doc, docIndex) => buildDocumentInspectionItem(device, doc, docIndex, deviceIndex, today));
  }).sort((a, b) => {
    const priorityWeight: Record<TaskPriority, number> = { critical: 0, high: 1, medium: 2, low: 3 };
    const priorityDiff = priorityWeight[a.priority] - priorityWeight[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    const daysA = a.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER;
    const daysB = b.daysUntilExpiry ?? Number.MAX_SAFE_INTEGER;
    if (daysA !== daysB) return daysA - daysB;
    return a.deviceName.localeCompare(b.deviceName, 'vi');
  });
};

const workflowLabels: Record<WorkflowStatus, string> = {
  todo: 'Chưa làm',
  preparing: 'Đang chuẩn bị',
  submitted: 'Đã gửi',
  approved: 'Đã phê duyệt',
  returned: 'Bị trả lại',
};

export const getWorkflowLabel = (status: WorkflowStatus) => workflowLabels[status];

export const buildInspectionTasks = (
  inspectionItems: InspectionItem[],
  overrides: WorkflowOverrides = {}
): InspectionTask[] => {
  return inspectionItems
    .filter(item => item.needsAction)
    .map(item => {
      const override = overrides[item.taskKey];
      const workflowStatus = override?.status || (item.statusKind === 'missing' ? 'todo' : 'preparing');
      return {
        ...item,
        workflowStatus,
        workflowLabel: workflowLabels[workflowStatus],
        note: override?.note || '',
        updatedAt: override?.updatedAt || '',
      };
    });
};

const eventSortValue = (dateText: string) => parseFlexibleDate(dateText)?.getTime() || 0;

export const buildAuditEvents = ({
  devices,
  repairs,
  transfers,
  inspectionTasks,
  costEntries,
}: {
  devices: DeviceData[];
  repairs: RepairData[];
  transfers: TransferData[];
  inspectionTasks: InspectionTask[];
  costEntries: CostEntry[];
}): AuditEvent[] => {
  const deviceNames = new Map(devices.map(device => [device.id, device.name]));
  const events: AuditEvent[] = [];

  repairs.forEach((repair, index) => {
    events.push({
      id: `repair-${repair.rowId}-${repair.deviceId}-${index}`,
      type: 'repair',
      date: cleanText(repair.rowId),
      deviceId: repair.deviceId,
      title: `Cập nhật sửa chữa ${repair.deviceId}`,
      description: `${cleanText(repair.description)} - ${cleanText(repair.status)}`,
      actor: cleanText(repair.userName),
    });
  });

  transfers.forEach((transfer, index) => {
    events.push({
      id: `transfer-${transfer.transferId}-${index}`,
      type: 'transfer',
      date: cleanText(transfer.updatedAt || transfer.receivedAt || transfer.requestedAt || transfer.createdAt),
      deviceId: transfer.deviceId,
      title: `Luân chuyển ${transfer.deviceName || transfer.deviceId}`,
      description: `${cleanText(transfer.fromDepartment)} -> ${cleanText(transfer.toDepartment)} (${cleanText(transfer.status)})`,
      actor: cleanText(transfer.requestedByName || transfer.requestedBy),
    });
  });

  inspectionTasks.forEach((task, index) => {
    events.push({
      id: `inspection-${task.taskKey}-${index}`,
      type: 'inspection-task',
      date: cleanText(task.updatedAt || task.issuedDate || task.expiryDate),
      deviceId: task.deviceId,
      title: `Hồ sơ ${task.docType}`,
      description: `${task.statusText} - ${task.workflowLabel}`,
      actor: cleanText(task.responsible),
    });
  });

  costEntries.forEach((entry, index) => {
    events.push({
      id: `cost-${entry.id}-${index}`,
      type: 'cost',
      date: cleanText(entry.date),
      deviceId: entry.deviceId,
      title: `Chi phí ${deviceNames.get(entry.deviceId) || entry.deviceId}`,
      description: `${entry.category}: ${formatCurrencyVnd(entry.amount)} - ${cleanText(entry.note)}`,
      actor: cleanText(entry.vendor),
    });
  });

  return events.sort((a, b) => eventSortValue(b.date) - eventSortValue(a.date));
};

export const formatCurrencyVnd = (value: number) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0).replace(/\u00a0/g, ' ');
};

export const getMonthKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

export const getCalendarDays = (monthDate: Date) => {
  const firstDay = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startOffset = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
  const days: Array<{ date: Date; inMonth: boolean; key: string }> = [];
  const cursor = new Date(firstDay);
  cursor.setDate(firstDay.getDate() - startOffset);

  while (days.length < 42) {
    const date = new Date(cursor);
    days.push({
      date,
      inMonth: date.getMonth() === monthDate.getMonth(),
      key: date.toISOString().slice(0, 10),
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return days;
};
