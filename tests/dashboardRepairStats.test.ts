import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRepairStatsByMonth } from '../src/utils/dashboardStats.ts';
import type { RepairData } from '../src/services/api.ts';

test('repair month statistics count repeated valid cases but exclude rejected requests', () => {
  const repairs = [
    {
      rowId: '02/05/2026',
      deviceId: 'TB-001',
      userName: 'A',
      userEmail: 'a@example.com',
      description: 'Lỗi nguồn',
      status: 'Đang sửa chữa',
    },
    {
      rowId: '05/05/2026',
      deviceId: 'TB-001',
      userName: 'A',
      userEmail: 'a@example.com',
      description: 'Báo lại lỗi nguồn',
      status: 'Chờ duyệt',
    },
    {
      rowId: '09/05/2026',
      deviceId: 'TB-002',
      userName: 'B',
      userEmail: 'b@example.com',
      description: 'Không đúng lỗi thiết bị',
      status: 'Từ chối',
    },
    {
      rowId: '10/05/2026',
      deviceId: 'TB-003',
      userName: 'C',
      userEmail: 'c@example.com',
      description: 'Không đồng ý tiếp nhận',
      status: 'Khong dong y',
    },
  ] satisfies RepairData[];

  const monthStats = buildRepairStatsByMonth(repairs, 2026);

  assert.equal(monthStats[4], 2);
  assert.equal(monthStats.reduce((sum, count) => sum + count, 0), 2);
});
