import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const utilityUrl = new URL('../src/utils/departmentQrPrint.ts', import.meta.url);

const makeDevice = (id: string, name: string, department: string) => ({
  id,
  name,
  department,
  status: 'Hoạt động',
  dateAdded: '15/07/2026',
});

test('department QR print options count assigned devices and ignore blank departments', async () => {
  assert.equal(
    existsSync(fileURLToPath(utilityUrl)),
    true,
    'Cần có tiện ích chọn thiết bị để in QR theo khoa/phòng.',
  );

  const { buildDepartmentQrPrintOptions } = await import(utilityUrl.href);
  const devices = [
    makeDevice('NOI-02', 'Máy thở', ' Khoa Nội '),
    makeDevice('NGOAI-01', 'Dao mổ điện', 'Khoa Ngoại'),
    makeDevice('NOI-01', 'Máy điện tim', 'Khoa Nội'),
    makeDevice('NONE-01', 'Thiết bị chưa phân khoa', '   '),
  ];

  assert.deepEqual(buildDepartmentQrPrintOptions(devices), [
    { department: 'Khoa Ngoại', count: 1 },
    { department: 'Khoa Nội', count: 2 },
  ]);
});

test('department QR print selection includes every device without the old 20-item limit', async () => {
  assert.equal(existsSync(fileURLToPath(utilityUrl)), true);

  const { selectDevicesForDepartmentQrPrint } = await import(utilityUrl.href);
  const departmentDevices = Array.from({ length: 25 }, (_, index) => {
    const number = 25 - index;
    return makeDevice(`NOI-${String(number).padStart(2, '0')}`, `Thiết bị ${String(number).padStart(2, '0')}`, 'Khoa Nội');
  });
  const devices = [
    makeDevice('NGOAI-01', 'Dao mổ điện', 'Khoa Ngoại'),
    ...departmentDevices,
  ];

  const selected = selectDevicesForDepartmentQrPrint(devices, 'Khoa Nội');

  assert.equal(selected.length, 25);
  assert.equal(selected[0]?.id, 'NOI-01');
  assert.equal(selected.at(-1)?.id, 'NOI-25');
  assert.deepEqual(selectDevicesForDepartmentQrPrint(devices, ''), []);
  assert.deepEqual(selectDevicesForDepartmentQrPrint(devices, 'Khoa không tồn tại'), []);
});

test('device list exposes an accessible department QR print workflow', () => {
  const source = readFileSync('src/pages/DeviceList.tsx', 'utf8');
  const css = readFileSync('src/pages/Devices.css', 'utf8');
  const modalSource = readFileSync('src/components/ui/Modal.tsx', 'utf8');

  assert.match(source, /In QR theo khoa\/phòng/);
  assert.match(source, /htmlFor="qr-print-department"/);
  assert.match(source, /aria-describedby="qr-print-department-help"/);
  assert.match(source, /selectDevicesForDepartmentQrPrint/);
  assert.doesNotMatch(source, /setPrintingDevices\(filteredDevices\.slice\(0,\s*20\)\)/);
  assert.match(css, /\.department-print-manifest/);
  assert.match(modalSource, /aria-labelledby=\{titleId\}/);
  assert.match(modalSource, /event\.key === 'Tab'/);
  assert.match(modalSource, /previousFocusRef/);
  assert.match(modalSource, /tabIndex=\{-1\}/);
});
