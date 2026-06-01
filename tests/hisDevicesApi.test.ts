import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildHisDevicesUrl,
  fetchHisDepartmentDashboard,
  getHisDevicesApiBaseUrl,
  unwrapHisDevicesResponse,
  type HisDashboardStats,
  type HisDepartmentDashboard,
} from '../src/services/hisDevicesApi.ts';

test('his devices API base URL falls back to local FastAPI server', () => {
  assert.equal(getHisDevicesApiBaseUrl({}), 'http://127.0.0.1:8997');
});

test('his devices API URL appends filters without empty query values', () => {
  const url = buildHisDevicesUrl('/api/devices/in-use', {
    dept: 'ICU',
    category: '',
    search: 'monitor',
    page: 1,
  }, 'http://127.0.0.1:8997/');

  assert.equal(url, 'http://127.0.0.1:8997/api/devices/in-use?dept=ICU&search=monitor&page=1');
});

test('his devices API builds department dashboard endpoint filters', () => {
  const url = buildHisDevicesUrl('/api/dashboard/departments', {
    dept: 'NHI',
    category: 'MONITOR',
  }, 'http://127.0.0.1:8997');

  assert.equal(url, 'http://127.0.0.1:8997/api/dashboard/departments?dept=NHI&category=MONITOR');
  assert.equal(typeof fetchHisDepartmentDashboard, 'function');
});

test('his devices API dashboard contracts include maintenance and department summaries', () => {
  const stats: HisDashboardStats = {
    patients_using: 3,
    machines_total: 12,
    machines_in_use: 4,
    machines_available: 7,
    machines_maintenance: 1,
    categories: [],
  };
  const dashboard: HisDepartmentDashboard = {
    summary: {
      departments: 2,
      machines_total: 12,
      in_use: 4,
      available: 7,
      maintenance: 1,
    },
    departments: [{
      department_code: 'NHI',
      department_name: 'Khoa Nhi',
      total: 5,
      in_use: 2,
      available: 2,
      maintenance: 1,
      rooms: [{ room_code: 'P101', total: 5, in_use: 2, available: 2, maintenance: 1 }],
      devices: {
        in_use: [],
        available: [],
        maintenance: [],
      },
    }],
  };

  assert.equal(stats.machines_maintenance, 1);
  assert.equal(dashboard.departments[0].devices.maintenance.length, 0);
});

test('his devices API unwraps FastAPI success envelope', () => {
  const payload = unwrapHisDevicesResponse<{ total: number }>({
    success: true,
    data: { total: 3 },
  });

  assert.deepEqual(payload, { total: 3 });
});

test('his devices API throws message from FastAPI failure envelope', () => {
  assert.throws(
    () => unwrapHisDevicesResponse({ success: false, message: 'Database unavailable' }),
    /Database unavailable/
  );
});
