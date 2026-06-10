import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('inventory QR module is routed, visible in navigation, and supports local scan runs', () => {
  const app = readFileSync('src/App.tsx', 'utf8');
  const sidebar = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
  const page = readFileSync('src/pages/InventoryQr.tsx', 'utf8');
  const api = readFileSync('src/services/api.ts', 'utf8');
  const gas = readFileSync('gas/Code.gs', 'utf8');

  assert.match(app, /const InventoryQr = lazy\(\(\) => import\('\.\/pages\/InventoryQr'\)\)/);
  assert.match(app, /path="inventory"/);
  assert.match(sidebar, /path: '\/inventory'/);
  assert.match(sidebar, /name: 'Kiểm kê QR'/);
  assert.match(page, /qlttb\.inventory_runs/);
  assert.match(page, /Tạo đợt kiểm kê/);
  assert.match(page, /Ghi nhận mã QR/);
  assert.match(page, /html5-qrcode/);
  assert.match(page, /Thủ công/);
  assert.match(page, /Mở camera/);
  assert.match(page, /Chọn hoặc chụp ảnh mã/);
  assert.match(page, /scanFile/);
  assert.match(page, /Thiết bị chưa quét/);
  assert.match(page, /Sai khoa\/phòng/);
  assert.match(page, /exportCsv/);
  assert.match(page, /saveInventoryRun/);
  assert.match(page, /sheetName/);
  assert.match(page, /Đồng bộ lại/);
  assert.match(page, /Action không hợp lệ: saveInventoryRun/);
  assert.match(api, /export const saveInventoryRun/);
  assert.match(api, /postAction\('saveInventoryRun'/);
  assert.match(gas, /case 'saveInventoryRun'/);
  assert.match(gas, /function saveInventoryRun_/);
  assert.match(gas, /function inventorySheetName_/);
  assert.match(gas, /InventoryRuns/);
});
