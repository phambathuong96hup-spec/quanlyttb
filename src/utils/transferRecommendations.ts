import type { DeviceData, TransferData } from '../services/api.ts';
import { getDeviceStatusFlags } from './deviceStatus.ts';
import { isAssignableDepartment } from './departmentUtils.ts';
import { removeVietnameseTones } from './stringUtils.ts';

export interface TransferRecommendation {
  device: DeviceData;
  reason: string;
  remainingInSource: number;
  guardedDepartment?: string;
}

export interface TransferStockGuardViolation {
  department: string;
  deviceType: string;
}

interface BuildTransferRecommendationsInput {
  devices: DeviceData[];
  targetDepartment?: string;
  requestedDeviceId?: string;
  requestedDeviceType?: string;
  pendingTransfers?: TransferData[];
  limit?: number;
}

const GUARDED_DEPARTMENTS = [
  {
    label: 'HSCC',
    matchers: ['cap cuu', 'hoi suc'],
  },
  {
    label: 'Nhi',
    matchers: ['khoa nhi'],
  },
];

const normalize = (value: unknown) => removeVietnameseTones(String(value ?? '').toLowerCase())
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const cleanText = (value: unknown) => String(value ?? '').trim();

const getDeviceTypeKey = (device?: DeviceData) => {
  if (!device) return '';
  const semanticGroup = cleanText(device.category || device.category_code || device.classification);
  if (semanticGroup) return normalize(semanticGroup);

  const group = cleanText(device.group);
  if (group && !/^[ivx]+$/i.test(group)) return normalize(group);

  return normalize(device.name || device['Tên Thiết bị']);
};

const getDeviceDepartment = (device: DeviceData) => cleanText(device.department || device['Nơi đặt thiết bị']);

const getGuardedDepartment = (department: string) => {
  const normalizedDepartment = normalize(department);
  return GUARDED_DEPARTMENTS.find(item => item.matchers.every(matcher => normalizedDepartment.includes(matcher)))?.label;
};

const isPendingTransferDevice = (device: DeviceData, pendingTransfers: TransferData[]) => {
  return pendingTransfers.some(transfer => transfer.status === 'PENDING_RECEIVE' && transfer.deviceId === device.id);
};

const isTransferable = (device: DeviceData, pendingTransfers: TransferData[]) => {
  const department = getDeviceDepartment(device);
  if (!device.id || !isAssignableDepartment(department)) return false;
  if (isPendingTransferDevice(device, pendingTransfers)) return false;
  return getDeviceStatusFlags(device).good;
};

const getDeviceQuantity = (device: DeviceData) => {
  const quantity = Number(device.quantity || device['Số lượng'] || 1);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1;
};

const countTransferableSameTypeInDepartment = (
  devices: DeviceData[],
  typeKey: string,
  department: string,
  pendingTransfers: TransferData[]
) => devices
  .filter(device => (
    getDeviceTypeKey(device) === typeKey
    && getDeviceDepartment(device) === department
    && isTransferable(device, pendingTransfers)
  ))
  .reduce((total, device) => total + getDeviceQuantity(device), 0);

export const getTransferStockGuardViolation = ({
  devices,
  selectedDeviceId,
  targetDepartment = '',
  pendingTransfers = [],
}: {
  devices: DeviceData[];
  selectedDeviceId: string;
  targetDepartment?: string;
  pendingTransfers?: TransferData[];
}): TransferStockGuardViolation | null => {
  const selectedDevice = devices.find(device => device.id === selectedDeviceId);
  if (!selectedDevice) return null;

  const sourceDepartment = getDeviceDepartment(selectedDevice);
  if (normalize(sourceDepartment) === normalize(targetDepartment)) return null;

  const guardedDepartment = getGuardedDepartment(sourceDepartment);
  if (!guardedDepartment) return null;

  const typeKey = getDeviceTypeKey(selectedDevice);
  const sourceStock = countTransferableSameTypeInDepartment(devices, typeKey, sourceDepartment, pendingTransfers);
  if (sourceStock - 1 >= 1) return null;

  return {
    department: guardedDepartment,
    deviceType: cleanText(selectedDevice.name || selectedDevice['Tên Thiết bị'] || typeKey),
  };
};

export const buildTransferRecommendations = ({
  devices,
  targetDepartment = '',
  requestedDeviceId = '',
  requestedDeviceType = '',
  pendingTransfers = [],
  limit = 5,
}: BuildTransferRecommendationsInput): TransferRecommendation[] => {
  const requestedDevice = devices.find(device => device.id === requestedDeviceId);
  const requestedTypeKey = requestedDeviceType ? normalize(requestedDeviceType) : getDeviceTypeKey(requestedDevice);
  const normalizedTargetDepartment = normalize(targetDepartment);
  if (!requestedTypeKey) return [];

  return devices
    .filter(device => getDeviceTypeKey(device) === requestedTypeKey)
    .filter(device => isTransferable(device, pendingTransfers))
    .filter(device => normalize(getDeviceDepartment(device)) !== normalizedTargetDepartment)
    .map((device): TransferRecommendation | null => {
      const sourceDepartment = getDeviceDepartment(device);
      const guardedDepartment = getGuardedDepartment(sourceDepartment);
      const sourceStock = countTransferableSameTypeInDepartment(devices, requestedTypeKey, sourceDepartment, pendingTransfers);
      const remainingInSource = Math.max(0, sourceStock - 1);

      if (guardedDepartment && remainingInSource < 1) return null;

      return {
        device,
        remainingInSource,
        guardedDepartment,
        reason: guardedDepartment
          ? `Còn ${remainingInSource} thiết bị cùng loại tại ${guardedDepartment} sau luân chuyển`
          : `Còn ${remainingInSource} thiết bị cùng loại tại khoa nguồn`,
      };
    })
    .filter((item): item is TransferRecommendation => Boolean(item))
    .sort((first, second) => {
      if (first.device.id === requestedDeviceId) return -1;
      if (second.device.id === requestedDeviceId) return 1;
      return second.remainingInSource - first.remainingInSource
        || getDeviceDepartment(first.device).localeCompare(getDeviceDepartment(second.device), 'vi')
        || String(first.device.name).localeCompare(String(second.device.name), 'vi');
    })
    .slice(0, limit);
};
