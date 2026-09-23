import test from 'node:test';
import assert from 'node:assert/strict';
import { extractScanCode, matchDeviceByCode } from '../src/components/qr/qrCodeMatcher.ts';
import type { DeviceData } from '../src/services/api.ts';

const mockDevices: DeviceData[] = [
  {
    id: 'TB-01',
    name: 'Máy đo điện tim',
    department: 'Khoa Cấp cứu',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    serial: 'SN-001',
  },
  {
    id: 'TB-010',
    name: 'Máy theo dõi bệnh nhân 1',
    department: 'Khoa Hồi sức tích cực',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    serial: 'SN-010',
  },
  {
    id: 'TB-011',
    name: 'Máy theo dõi bệnh nhân 2',
    department: 'Khoa Hồi sức tích cực',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    serial: 'SN-011',
  },
  {
    id: 'TB-02; TB-02A',
    name: 'Bơm tiêm điện đa kênh',
    department: 'Khoa Phẫu thuật - Gây mê hồi sức',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    serial: 'SN-002',
  },
  {
    id: 'TB-03',
    name: 'Máy thở chức năng cao',
    department: 'Khoa Cấp cứu',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    'Seri Máy': 'SN-SERI-03',
  },
  {
    id: 'TB-04A',
    name: 'Đèn mổ di động A',
    department: 'Khoa Phẫu thuật - Gây mê hồi sức',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    serial: 'SN-DUP-99',
  },
  {
    id: 'TB-04B',
    name: 'Đèn mổ di động B',
    department: 'Khoa Cấp cứu',
    status: 'Đang sử dụng',
    dateAdded: '01/01/2025',
    serial: 'SN-DUP-99',
  },
];

test('extractScanCode: correctly extracts IDs from various URL formats', () => {
  assert.strictEqual(
    extractScanCode('https://qlttb.hospital.vn/devices/TB-01'),
    'TB-01'
  );
  assert.strictEqual(
    extractScanCode('http://localhost:5173/app/devices/TB-010?view=full#spec'),
    'TB-010'
  );
  assert.strictEqual(
    extractScanCode('https://qlttb.hospital.vn/devices/TB%2001/'),
    'TB 01'
  );
  assert.strictEqual(
    extractScanCode('https://qlttb.hospital.vn/devices/TB%2F02'),
    'TB/02'
  );
  assert.strictEqual(
    extractScanCode('/devices/TB-03'),
    'TB-03'
  );
});

test('extractScanCode: correctly parses JSON formatted QR codes', () => {
  assert.strictEqual(extractScanCode('{"id":"TB-01"}'), 'TB-01');
  assert.strictEqual(extractScanCode('{"deviceId":"TB-02"}'), 'TB-02');
  assert.strictEqual(extractScanCode('{"code":"TB-03"}'), 'TB-03');
  assert.strictEqual(extractScanCode('{"maThietBi":"TB-04"}'), 'TB-04');
  assert.strictEqual(extractScanCode('{"serial":"SN-001"}'), 'SN-001');
});

test('extractScanCode: handles labelled prefixes (Vietnamese and English)', () => {
  assert.strictEqual(extractScanCode('MÃ THIẾT BỊ: TB-01'), 'TB-01');
  assert.strictEqual(extractScanCode('Mã TB: TB-02'), 'TB-02');
  assert.strictEqual(extractScanCode('Device ID: TB-03'), 'TB-03');
  assert.strictEqual(extractScanCode('Serial: SN-001'), 'SN-001');
  assert.strictEqual(extractScanCode('Seri: SN-002'), 'SN-002');
});

test('extractScanCode: preserves raw IDs and barcodes', () => {
  assert.strictEqual(extractScanCode('TB-01'), 'TB-01');
  assert.strictEqual(extractScanCode('8931234567890'), '8931234567890');
  assert.strictEqual(extractScanCode('  SN-123456  '), 'SN-123456');
  assert.strictEqual(extractScanCode(''), '');
});

test('matchDeviceByCode: exact match prevents substring false positives', () => {
  // Bugfix verification: TB-01 must match ONLY TB-01, NOT TB-010 or TB-011
  const result = matchDeviceByCode(mockDevices, 'TB-01');
  assert.strictEqual(result.status, 'found');
  if (result.status === 'found') {
    assert.strictEqual(result.device.id, 'TB-01');
    assert.strictEqual(result.matchedBy, 'id');
  }

  // Case insensitive match
  const lowerResult = matchDeviceByCode(mockDevices, 'tb-01');
  assert.strictEqual(lowerResult.status, 'found');
  if (lowerResult.status === 'found') {
    assert.strictEqual(lowerResult.device.id, 'TB-01');
  }
});

test('matchDeviceByCode: matches semicolon-separated alias IDs', () => {
  const matchFirstAlias = matchDeviceByCode(mockDevices, 'TB-02');
  assert.strictEqual(matchFirstAlias.status, 'found');
  if (matchFirstAlias.status === 'found') {
    assert.strictEqual(matchFirstAlias.device.id, 'TB-02; TB-02A');
    assert.strictEqual(matchFirstAlias.matchedBy, 'alias');
  }

  const matchSecondAlias = matchDeviceByCode(mockDevices, 'TB-02A');
  assert.strictEqual(matchSecondAlias.status, 'found');
  if (matchSecondAlias.status === 'found') {
    assert.strictEqual(matchSecondAlias.device.id, 'TB-02; TB-02A');
    assert.strictEqual(matchSecondAlias.matchedBy, 'alias');
  }
});

test('matchDeviceByCode: matches serial number and "Seri Máy"', () => {
  const matchSerial = matchDeviceByCode(mockDevices, 'SN-001');
  assert.strictEqual(matchSerial.status, 'found');
  if (matchSerial.status === 'found') {
    assert.strictEqual(matchSerial.device.id, 'TB-01');
    assert.strictEqual(matchSerial.matchedBy, 'serial');
  }

  const matchSeriMay = matchDeviceByCode(mockDevices, 'SN-SERI-03');
  assert.strictEqual(matchSeriMay.status, 'found');
  if (matchSeriMay.status === 'found') {
    assert.strictEqual(matchSeriMay.device.id, 'TB-03');
    assert.strictEqual(matchSeriMay.matchedBy, 'serial');
  }
});

test('matchDeviceByCode: reports ambiguous match when duplicate serials exist', () => {
  // SN-DUP-99 exists on both TB-04A and TB-04B
  const ambiguousResult = matchDeviceByCode(mockDevices, 'SN-DUP-99');
  assert.strictEqual(ambiguousResult.status, 'ambiguous');
  if (ambiguousResult.status === 'ambiguous') {
    assert.strictEqual(ambiguousResult.devices.length, 2);
    assert.deepStrictEqual(
      ambiguousResult.devices.map(d => d.id).sort(),
      ['TB-04A', 'TB-04B']
    );
  }
});

test('matchDeviceByCode: reports not_found for non-existent codes or external URLs', () => {
  const notFound = matchDeviceByCode(mockDevices, 'TB-9999');
  assert.strictEqual(notFound.status, 'not_found');

  const untrustedUrl = matchDeviceByCode(mockDevices, 'https://example.com/untrusted-page');
  assert.strictEqual(untrustedUrl.status, 'not_found');
});

test('matchDeviceByCode: returns empty for blank input', () => {
  const empty = matchDeviceByCode(mockDevices, '   ');
  assert.strictEqual(empty.status, 'empty');
});
