import { test, expect, type Page } from '@playwright/test';

declare global { interface Window { qrProbe: { starts: number; active: number; max: number; imageStarts: number; decode: (code: string) => void; finishImage: () => void }; } }

async function setup(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('qlttb.auth', JSON.stringify({ username: 'qr-review', name: 'QR Review', role: 'Admin', department: 'Khoa A', token: 'mock-token', expiresAt: Date.now() + 3600000 }));
  });
  await page.route('**/macros/s/**/exec*', async route => {
    const action = route.request().method() === 'GET' ? new URL(route.request().url()).searchParams.get('action') : route.request().postDataJSON()?.action;
    const devices = [
      { id: 'TB-001', 'Tên Thiết bị': 'Máy thở thử nghiệm', 'Nơi đặt thiết bị': 'Khoa A', 'Seri Máy': 'DUP', 'Hiện trạng thực tế': 'Đang sử dụng' },
      { id: 'TB-002', 'Tên Thiết bị': 'Máy thứ hai', 'Nơi đặt thiết bị': 'Khoa B', 'Seri Máy': 'DUP', 'Hiện trạng thực tế': 'Đang sử dụng' },
    ];
    const body = action === 'getDevices' ? (route.request().method() === 'GET' ? devices : { success: true, data: devices }) : { success: true, data: [], sheetName: 'QA' };
    await route.fulfill({ json: body });
  });
}

test('repair scanner retains result until confirmation and preserves draft', async ({ page }) => {
  await setup(page);
  await page.goto('/requests?type=repair');
  await page.locator('textarea').first().fill('Bản nháp cần giữ');
  await page.getByRole('button', { name: 'Quét mã thiết bị', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quét thiết bị báo hỏng' });
  await dialog.getByRole('tab', { name: 'Nhập mã', exact: true }).click();
  await dialog.getByPlaceholder('VD: TB-001 hoặc serial máy').fill('TB-001');
  await dialog.getByRole('button', { name: 'Tìm kiếm' }).click();
  await expect(dialog.getByRole('heading', { name: 'Máy thở thử nghiệm', exact: true })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: `tmp/qr-repair-${test.info().project.name}.png` });
  await expect(page.locator('#repair-device')).toHaveValue('');
  await dialog.getByRole('button', { name: 'Dùng thiết bị này' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.locator('#repair-device')).toHaveValue('TB-001');
  await expect(page.locator('textarea').first()).toHaveValue('Bản nháp cần giữ');
});

test('inventory confirms once and retains pending data on server failure', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => sessionStorage.setItem('qlttb.inventory_runs:qr-review', JSON.stringify([
    { runId: 'QR-TEST', name: 'Đợt thử nghiệm', department: 'all', status: 'active', scans: [], createdAt: new Date().toISOString(), createdBy: 'QA', syncStatus: 'pending' },
  ])));
  let saves = 0;
  await page.route('**/macros/s/**/exec*', async route => {
    if (route.request().postData()?.includes('saveInventoryRun')) {
      saves++;
      await route.fulfill({ json: { success: false, message: 'Mất kết nối thử nghiệm' } });
    } else await route.fallback();
  });
  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Quét thiết bị', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quét thiết bị kiểm kê' });
  await dialog.getByRole('tab', { name: 'Nhập mã', exact: true }).click();
  await dialog.getByPlaceholder('VD: TB-001 hoặc serial máy').fill('TB-001');
  await dialog.getByRole('button', { name: 'Tìm kiếm' }).click();
  expect(saves).toBe(0);
  await page.screenshot({ animations: 'disabled', path: `tmp/qr-inventory-${test.info().project.name}.png` });
  await dialog.getByRole('button', { name: 'Xác nhận kiểm kê', exact: true }).click();
  await expect(dialog.getByRole('alert').filter({ hasText: 'lưu tạm' })).toBeVisible();
  expect(saves).toBe(1);
  await dialog.getByRole('button', { name: 'Quét thiết bị tiếp theo' }).click();
  await dialog.getByPlaceholder('VD: TB-001 hoặc serial máy').fill('TB-001');
  await dialog.getByRole('button', { name: 'Tìm kiếm' }).click();
  await expect(dialog.getByRole('button', { name: 'Xác nhận kiểm kê', exact: true })).toBeDisabled();
  const saved = await page.evaluate(() => JSON.parse(sessionStorage.getItem('qlttb.inventory_runs:qr-review') || '[]'));
  expect(saved[0].scans).toHaveLength(1);
  expect(saved[0].syncStatus).toBe('pending');
});

async function mockScanner(page: Page) {
  await page.route('**/html5-qrcode.js*', route => route.fulfill({ contentType: 'application/javascript', body: `
    window.qrProbe = { active: 0, max: 0, starts: 0, stops: 0, imageStarts: 0 };
    export const Html5QrcodeSupportedFormats = {};
    export class Html5Qrcode {
      isScanning = false;
      static async getCameras() { return [{id:'rear',label:'Rear'},{id:'front',label:'Front'}]; }
      async start(config, options, onCode) {
        window.qrProbe.starts++;
        await new Promise(resolve => setTimeout(resolve, 250));
        this.isScanning = true;
        window.qrProbe.active++;
        window.qrProbe.max = Math.max(window.qrProbe.max, window.qrProbe.active);
        window.qrProbe.decode = onCode;
      }
      async stop() { this.isScanning = false; window.qrProbe.active--; window.qrProbe.stops++; }
      clear() {}
      getRunningTrackCapabilities() { return { torch: true }; }
      getRunningTrackSettings() { return {deviceId:'rear'}; }
      async applyVideoConstraints() {}
      async scanFile() { window.qrProbe.imageStarts++; await new Promise(resolve => { window.qrProbe.finishImage = resolve; }); return 'TB-001'; }
    }
  ` }));
}

test('camera stops across source switch and dialog close; stale image is ignored', async ({ page }) => {
  await setup(page);
  await mockScanner(page);
  await page.goto('/requests?type=repair');
  const open = page.getByRole('button', { name: 'Quét mã thiết bị', exact: true });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Quét thiết bị báo hỏng' });
  await expect.poll(() => page.evaluate(() => window.qrProbe.starts)).toBe(1);
  await dialog.getByRole('button', { name: 'Đóng máy quét' }).click();
  await open.click();
  await expect.poll(() => page.evaluate(() => window.qrProbe.active)).toBe(1);
  await expect(dialog.getByRole('button', { name: 'Đổi camera' })).toBeVisible();
  await page.screenshot({ animations: 'disabled', path: `tmp/qr-camera-${test.info().project.name}.png` });
  await page.evaluate(() => { window.qrProbe.decode('TB-001'); window.qrProbe.decode('TB-001'); });
  await expect(dialog.getByRole('heading', { name: 'Máy thở thử nghiệm', exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.qrProbe.active)).toBe(0);
  await dialog.getByRole('button', { name: 'Quét lại', exact: true }).click();
  await expect(dialog.getByRole('button', { name: 'Đổi camera' })).toBeVisible();
  await dialog.getByRole('tab', { name: 'Chọn ảnh', exact: true }).click();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'qr.png', mimeType: 'image/png', buffer: Buffer.from('mock') });
  await expect.poll(() => page.evaluate(() => window.qrProbe.imageStarts)).toBe(1);
  await dialog.getByRole('tab', { name: 'Nhập mã', exact: true }).click();
  await page.evaluate(() => window.qrProbe.finishImage());
  await expect.poll(() => page.evaluate(() => window.qrProbe.active)).toBe(0);
  await expect(dialog.getByPlaceholder('VD: TB-001 hoặc serial máy')).toBeVisible();
  await expect(dialog.getByRole('heading', { name: 'Máy thở thử nghiệm', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => window.qrProbe.max)).toBe(1);
  await dialog.getByRole('button', { name: 'Đóng máy quét' }).click();
  await expect(open).toBeFocused();
});

test('camera denied offers fallback and cancel leaves selection unchanged', async ({ page }) => {
  await setup(page);
  await page.addInitScript(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException('Permission denied', 'NotAllowedError'); };
  });
  await page.goto('/requests?type=repair');
  await page.locator('#repair-device').selectOption('TB-002');
  await page.getByRole('button', { name: 'Quét mã thiết bị', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quét thiết bị báo hỏng' });
  await expect(dialog.getByText(/Chưa có quyền camera|Không mở được camera/)).toBeVisible();
  await dialog.getByRole('tab', { name: 'Nhập mã', exact: true }).click();
  await dialog.getByPlaceholder('VD: TB-001 hoặc serial máy').fill('TB-00');
  await dialog.getByRole('button', { name: 'Tìm kiếm' }).click();
  await expect(dialog.getByRole('alert')).toContainText('Không tìm thấy');
  await dialog.getByRole('button', { name: 'Đóng máy quét' }).click();
  await expect(page.locator('#repair-device')).toHaveValue('TB-002');
});

test('transfer scan chooses type without sending a request', async ({ page }) => {
  await setup(page);
  let sent = 0;
  page.on('request', request => { if (request.postData()?.includes('createTransfer')) sent++; });
  await page.goto('/requests?type=transfer');
  await page.getByRole('button', { name: 'Quét mã thiết bị', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quét thiết bị luân chuyển' });
  await dialog.getByRole('tab', { name: 'Nhập mã', exact: true }).click();
  await dialog.getByPlaceholder('VD: TB-001 hoặc serial máy').fill('DUP');
  await dialog.getByRole('button', { name: 'Tìm kiếm' }).click();
  await expect(dialog.getByRole('alert')).toContainText('trùng');
  await expect(dialog.getByRole('button', { name: 'Dùng thiết bị này' })).toHaveCount(0);
  await dialog.getByPlaceholder('VD: TB-001 hoặc serial máy').fill('https://example.test/devices/TB-001');
  await dialog.getByRole('button', { name: 'Tìm kiếm' }).click();
  await page.screenshot({ animations: 'disabled', path: `tmp/qr-transfer-${test.info().project.name}.png` });
  await dialog.getByRole('button', { name: 'Dùng thiết bị này' }).click();
  await expect(page.getByRole('combobox').first()).toHaveValue('Máy thở thử nghiệm');
  expect(sent).toBe(0);
});

test('real QR image from existing device profile decodes in shared scanner', async ({ page }) => {
  await setup(page);
  await page.goto('/devices/TB-001');
  const image = await page.locator('.qr-code-box').screenshot();
  await page.goto('/requests?type=repair');
  await page.getByRole('button', { name: 'Quét mã thiết bị', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Quét thiết bị báo hỏng' });
  await dialog.getByRole('tab', { name: 'Chọn ảnh', exact: true }).click();
  await dialog.locator('input[type=file]').setInputFiles({ name: 'existing-label.png', mimeType: 'image/png', buffer: image });
  await expect(dialog.getByRole('heading', { name: 'Máy thở thử nghiệm', exact: true })).toBeVisible();
  await expect(page.locator('#repair-device')).toHaveValue('');
});
