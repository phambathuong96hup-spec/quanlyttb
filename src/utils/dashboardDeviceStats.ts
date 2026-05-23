import type { DeviceData, RepairData } from '../services/api.ts';
import { getDeviceStatusFlags } from './deviceStatus.ts';
import { isRepairActive } from './statusUtils.ts';

export interface DashboardDeviceSummary {
  stableDeviceCount: number;
  expiredComplianceCount: number;
  complianceWarningCount: number;
  activeRepairDeviceCount: number;
}

const cleanId = (value: unknown) => String(value || '').replace('[KHẨN] ', '').trim();

export const buildDashboardDeviceSummary = (
  devices: DeviceData[],
  repairs: RepairData[],
  today = new Date()
): DashboardDeviceSummary => {
  const activeRepairDeviceIds = new Set(
    repairs
      .filter(repair => isRepairActive(repair.status))
      .map(repair => cleanId(repair.deviceId))
      .filter(Boolean)
  );

  return devices.reduce<DashboardDeviceSummary>((summary, device) => {
    const flags = getDeviceStatusFlags(device, today);
    const deviceId = cleanId(device.id || device['Seri Máy']);
    const hasActiveRepair = activeRepairDeviceIds.has(deviceId);

    if (flags.expired) summary.expiredComplianceCount += 1;
    if (flags.complianceWarning) summary.complianceWarningCount += 1;
    if (hasActiveRepair) summary.activeRepairDeviceCount += 1;
    if (flags.good && !hasActiveRepair) summary.stableDeviceCount += 1;

    return summary;
  }, {
    stableDeviceCount: 0,
    expiredComplianceCount: 0,
    complianceWarningCount: 0,
    activeRepairDeviceCount: 0,
  });
};
