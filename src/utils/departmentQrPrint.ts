import type { DeviceData } from '../services/api';

export interface DepartmentQrPrintOption {
  department: string;
  count: number;
}

const normalizeDepartment = (department: unknown) => String(department || '').trim();

const compareVietnamese = (left: string, right: string) => left.localeCompare(right, 'vi', {
  numeric: true,
  sensitivity: 'base',
});

export const buildDepartmentQrPrintOptions = (devices: DeviceData[]): DepartmentQrPrintOption[] => {
  const departmentCounts = new Map<string, number>();

  devices.forEach(device => {
    const department = normalizeDepartment(device.department);
    if (!department) return;
    departmentCounts.set(department, (departmentCounts.get(department) || 0) + 1);
  });

  return Array.from(departmentCounts, ([department, count]) => ({ department, count }))
    .sort((left, right) => compareVietnamese(left.department, right.department));
};

export const selectDevicesForDepartmentQrPrint = (
  devices: DeviceData[],
  selectedDepartment: string,
): DeviceData[] => {
  const department = normalizeDepartment(selectedDepartment);
  if (!department) return [];

  return devices
    .filter(device => normalizeDepartment(device.department) === department)
    .sort((left, right) => {
      const nameComparison = compareVietnamese(String(left.name || ''), String(right.name || ''));
      return nameComparison || compareVietnamese(String(left.id || ''), String(right.id || ''));
    });
};
