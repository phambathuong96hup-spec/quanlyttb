import type { RepairData } from '../services/api.ts';
import { isRepairRejected } from './statusUtils.ts';

export const buildRepairStatsByMonth = (repairs: RepairData[], year: number): number[] => {
  const monthStats = new Array(12).fill(0);

  repairs.forEach(repair => {
    if (!repair.rowId || isRepairRejected(repair.status)) return;
    const parts = repair.rowId.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!parts) return;

    const month = Number(parts[2]);
    const repairYear = Number(parts[3]);
    if (repairYear === year && month >= 1 && month <= 12) {
      monthStats[month - 1] += 1;
    }
  });

  return monthStats;
};
