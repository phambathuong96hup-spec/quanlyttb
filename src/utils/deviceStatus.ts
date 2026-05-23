import type { DeviceData, DeviceDocument } from '../services/api.ts';
import { parseFlexibleDate } from './dateUtils.ts';
import { removeVietnameseTones } from './stringUtils.ts';

type BadgeVariant = 'success' | 'warning' | 'danger' | 'primary' | 'neutral';

export type DeviceStatusFilter =
  | 'all'
  | 'good'
  | 'reported'
  | 'repairing'
  | 'expired'
  | 'complianceWarning'
  | 'unassigned';

export type DeviceStatusKind = Exclude<DeviceStatusFilter, 'all'>;

export interface DeviceStatusFlags {
  good: boolean;
  reported: boolean;
  repairing: boolean;
  expired: boolean;
  complianceWarning: boolean;
  unassigned: boolean;
}

export interface DeviceListStatus {
  kind: DeviceStatusKind;
  label: string;
  className: 'is-ok' | 'is-warning' | 'is-danger' | 'is-neutral';
  badgeVariant: BadgeVariant;
  sheetStatus: string;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const REGISTRATION_WARNING_DAYS = 30;

const statusDescriptors: Record<DeviceStatusKind, DeviceListStatus> = {
  expired: {
    kind: 'expired',
    label: 'Hết hạn ĐK',
    className: 'is-danger',
    badgeVariant: 'danger',
    sheetStatus: 'Hết hạn đăng kiểm',
  },
  reported: {
    kind: 'reported',
    label: 'Báo hỏng',
    className: 'is-danger',
    badgeVariant: 'danger',
    sheetStatus: 'Báo hỏng',
  },
  repairing: {
    kind: 'repairing',
    label: 'Đang sửa chữa',
    className: 'is-warning',
    badgeVariant: 'warning',
    sheetStatus: 'Đang sửa chữa',
  },
  complianceWarning: {
    kind: 'complianceWarning',
    label: 'Cảnh báo ĐK',
    className: 'is-warning',
    badgeVariant: 'warning',
    sheetStatus: 'Sắp hết hạn đăng kiểm',
  },
  unassigned: {
    kind: 'unassigned',
    label: 'Chưa phân bổ',
    className: 'is-neutral',
    badgeVariant: 'neutral',
    sheetStatus: 'Chưa phân bổ',
  },
  good: {
    kind: 'good',
    label: 'Hoạt động tốt',
    className: 'is-ok',
    badgeVariant: 'success',
    sheetStatus: 'Hoạt động tốt',
  },
};

const primaryStatusPriority: DeviceStatusKind[] = [
  'expired',
  'reported',
  'repairing',
  'complianceWarning',
  'unassigned',
  'good',
];

const cleanText = (value: unknown) => String(value ?? '').trim();

const normalizedText = (value: unknown) => removeVietnameseTones(cleanText(value).toLowerCase());

const startOfDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const daysFromDateText = (dateText: string, today: Date) => {
  if (!dateText || normalizedText(dateText) === 'n/a') return null;
  const parsed = parseFlexibleDate(dateText);
  if (!parsed) return null;
  return Math.round((startOfDay(parsed).getTime() - startOfDay(today).getTime()) / MS_PER_DAY);
};

const getDocumentDaysUntilExpiry = (doc: DeviceDocument, today: Date) => {
  if (typeof doc.daysUntilExpiry === 'number') return doc.daysUntilExpiry;
  return daysFromDateText(cleanText(doc.expiryDate), today);
};

const getLegacyDaysUntilExpiry = (device: DeviceData, today: Date) => {
  const expiryDate = cleanText(
    device['Thời hạn cấp lại/ Hạn đăng kiểm']
    || device['Hạn đăng kiểm']
    || device['Ngày bảo dưỡng tiếp theo']
  );
  return daysFromDateText(expiryDate, today);
};

export const getOperationalDeviceStatus = (device: DeviceData) => cleanText(
  device['Hiện trạng thực tế']
  || device.operationalStatus
  || device.status
);

export const getDeviceStatusFlags = (device: DeviceData, today = new Date()): DeviceStatusFlags => {
  const operationalStatus = normalizedText(getOperationalDeviceStatus(device));
  const repairing = operationalStatus.includes('dang kiem tra')
    || operationalStatus.includes('sua chua')
    || operationalStatus.includes('sua xong');
  const reported = !repairing && (
    operationalStatus.includes('bao hong')
    || operationalStatus.includes('cho duyet')
    || operationalStatus.includes('hong')
  );

  const documentDays = (device.documents || [])
    .map(doc => getDocumentDaysUntilExpiry(doc, today))
    .filter((days): days is number => typeof days === 'number');
  if (documentDays.length === 0) {
    const legacyDays = getLegacyDaysUntilExpiry(device, today);
    if (typeof legacyDays === 'number') documentDays.push(legacyDays);
  }

  const expired = documentDays.some(days => days < 0);
  const complianceWarning = !expired && documentDays.some(days => days >= 0 && days <= REGISTRATION_WARNING_DAYS);
  const department = normalizedText(device.department || device['Nơi đặt thiết bị']);
  const unassigned = !department || department === 'chua phan bo';
  const good = !reported && !repairing && !expired && !complianceWarning && !unassigned;

  return {
    good,
    reported,
    repairing,
    expired,
    complianceWarning,
    unassigned,
  };
};

export const matchesDeviceStatusFilter = (
  device: DeviceData,
  filter: DeviceStatusFilter,
  today = new Date()
) => {
  if (filter === 'all') return true;
  return getDeviceStatusFlags(device, today)[filter];
};

export const resolveDeviceListStatus = (
  device: DeviceData,
  options: { today?: Date; activeFilter?: DeviceStatusFilter } = {}
): DeviceListStatus => {
  const today = options.today || new Date();
  const flags = getDeviceStatusFlags(device, today);

  if (options.activeFilter && options.activeFilter !== 'all' && flags[options.activeFilter]) {
    return statusDescriptors[options.activeFilter];
  }

  const primaryKind = primaryStatusPriority.find(kind => flags[kind]) || 'good';
  return statusDescriptors[primaryKind];
};

export const isRecentDevice = (device: DeviceData, today = new Date(), recentDays = 30) => {
  const dateAdded = cleanText(device.dateAdded);
  if (!dateAdded || normalizedText(dateAdded) === 'n/a') return false;
  const parsed = parseFlexibleDate(dateAdded);
  if (!parsed) return false;
  const diffDays = Math.abs(Math.round((startOfDay(today).getTime() - startOfDay(parsed).getTime()) / MS_PER_DAY));
  return diffDays <= recentDays;
};
