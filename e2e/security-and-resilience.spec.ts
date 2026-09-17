import { expect, test, type Page, type Route } from '@playwright/test';

const futureExpiry = Date.now() + 60 * 60 * 1000;

const validSession = {
  username: 'qa-admin',
  role: 'Admin',
  name: 'QA Admin',
  email: 'qa@example.test',
  department: 'Phòng Vật tư',
  token: 'qa-session-token',
  expiresAt: futureExpiry,
};

const devices = [
  {
    id: 'TB-001',
    'Tên Thiết bị': 'Máy thở QA',
    'Nơi đặt thiết bị': 'Khoa Hồi sức',
    'Hiện trạng thực tế': 'Đang sử dụng',
    'Seri Máy': 'TB-001',
    Nhóm: 'Máy thở',
    documents: [],
  },
  {
    id: 'TB-002',
    'Tên Thiết bị': 'Bơm tiêm điện QA',
    'Nơi đặt thiết bị': 'Khoa Nhi',
    'Hiện trạng thực tế': 'Đang sử dụng',
    'Seri Máy': 'TB-002',
    Nhóm: 'Bơm tiêm điện',
    documents: [],
  },
];

const seedSession = async (page: Page, session: Record<string, unknown>) => {
  await page.addInitScript(value => {
    window.sessionStorage.setItem('qlttb.auth', JSON.stringify(value));
  }, session);
};

const json = (route: Route, body: unknown) => route.fulfill({
  status: 200,
  contentType: 'application/json',
  body: JSON.stringify(body),
});

const actionFromRoute = (route: Route) => {
  if (route.request().method() === 'GET') {
    return new URL(route.request().url()).searchParams.get('action') || '';
  }
  try {
    return (route.request().postDataJSON() as { action?: string }).action || '';
  } catch {
    return '';
  }
};

interface MockGasOptions {
  delayedHistoryMs?: number;
  invalidSession?: boolean;
  onReportRepair?: (payload: Record<string, unknown>) => void;
}

const mockGas = async (page: Page, options: MockGasOptions = {}) => {
  await page.route('**/macros/s/**/exec*', async route => {
    const action = actionFromRoute(route);
    if (options.invalidSession && action !== 'login') {
      await json(route, { success: false, message: 'Phiên đăng nhập không hợp lệ hoặc đã hết hạn.' });
      return;
    }
    if (action === 'getDevices') {
      await json(route, route.request().method() === 'GET' ? devices : { success: true, data: devices });
      return;
    }
    if (action === 'getRepairs' || action === 'getTransfers') {
      if (options.delayedHistoryMs) await new Promise(resolve => setTimeout(resolve, options.delayedHistoryMs));
      await json(route, { success: true, data: [] });
      return;
    }
    if (action === 'getOperationalState') {
      await json(route, { success: true, data: { workflowOverrides: {}, costEntries: [] } });
      return;
    }
    if (action === 'getInventoryRuns') {
      await json(route, { success: true, data: [] });
      return;
    }
    if (action === 'reportRepair') {
      const requestBody = route.request().postDataJSON() as { payload?: Record<string, unknown> };
      const payload = requestBody.payload || {};
      options.onReportRepair?.(payload);
      const attachments = Array.isArray(payload.attachments) ? payload.attachments : [];
      const attachmentCount = attachments.length + (payload.imageContent ? 1 : 0);
      await json(route, {
        success: true,
        message: 'Đã ghi nhận báo hỏng.',
        attachmentCount,
        attachmentFailures: [],
        repair: {
          rowId: '2026-07-20T10:00:00.000Z',
          deviceId: payload.deviceId,
          userName: payload.userName,
          userEmail: payload.userEmail,
          description: payload.description,
          status: 'Chờ duyệt',
        },
      });
      return;
    }
    await json(route, { success: true, data: [] });
  });
};

test('a forged client session without a server token cannot open protected routes', async ({ page }) => {
  await seedSession(page, { username: 'forged-admin', role: 'Admin', name: 'Forged Admin' });
  await mockGas(page);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.locator('form').getByRole('button', { name: 'Đăng nhập', exact: true })).toBeVisible();
});

test('an invalid server session clears local auth and redirects to login', async ({ page }) => {
  await seedSession(page, validSession);
  await mockGas(page, { invalidSession: true });

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login$/, { timeout: 5_000 });
  await expect.poll(() => page.evaluate(() => sessionStorage.getItem('qlttb.auth'))).toBeNull();
});

test('device identity renders without waiting for repair and transfer history', async ({ page }) => {
  await seedSession(page, validSession);
  await mockGas(page, { delayedHistoryMs: 4_000 });

  await page.goto('/devices/TB-001');

  await expect(page.getByRole('heading', { name: 'Máy thở QA', exact: true })).toBeVisible({ timeout: 1_500 });
});

test('transfer creation keeps the device type placeholder until the user chooses', async ({ page }) => {
  await seedSession(page, validSession);
  await mockGas(page);

  await page.goto('/requests?type=transfer');
  const deviceType = page.getByRole('combobox').first();

  await expect(deviceType).toHaveValue('');
  await expect(page.getByRole('button', { name: /Gửi yêu cầu/ })).toBeDisabled();
});

test('repair request sends multiple images and videos in one compact payload', async ({ page }) => {
  let submittedPayload: Record<string, unknown> | undefined;
  await seedSession(page, validSession);
  await mockGas(page, { onReportRepair: payload => { submittedPayload = payload; } });

  await page.goto('/requests?type=repair');

  const attachmentInput = page.locator('input[type="file"][multiple]');
  await page.getByLabel('Thiết bị báo hỏng', { exact: true }).selectOption('TB-001');
  await expect(attachmentInput).toHaveCount(1);
  await attachmentInput.setInputFiles([
    { name: 'hien-trang.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('qa-image') },
    { name: 'van-hanh.mp4', mimeType: 'video/mp4', buffer: Buffer.from('qa-video') },
  ]);

  await expect(page.locator('.file-uploader-file')).toHaveCount(2);
  await expect(page.locator('.file-uploader-status')).toContainText('Đã chọn 2/8 tệp');
  await page.getByPlaceholder(/Mô tả chi tiết biểu hiện lỗi/).fill('Máy phát tiếng ồn bất thường khi khởi động.');
  await page.getByRole('button', { name: 'Gửi yêu cầu sửa chữa' }).click();

  await expect.poll(() => submittedPayload).toBeTruthy();
  const attachments = submittedPayload?.attachments as Array<Record<string, unknown>>;
  expect(submittedPayload?.imageName).toBe('hien-trang.jpg');
  expect(submittedPayload?.imageMimeType).toBe('image/jpeg');
  expect(submittedPayload?.imageContent).toBeTruthy();
  expect(attachments).toHaveLength(1);
  expect(attachments[0]).toMatchObject({ name: 'van-hanh.mp4', mimeType: 'video/mp4' });
  expect(attachments[0].content).not.toBe(submittedPayload?.imageContent);
  await expect(page.locator('.request-subtab.active')).toContainText('Tiếp nhận yêu cầu');
  await page.locator('.request-subtab').filter({ hasText: 'Tạo yêu cầu' }).click();
  await expect(page.getByLabel('Thiết bị báo hỏng', { exact: true })).toHaveValue('');
});

test('norms lookup separates departments and supports search and pagination', async ({ page }) => {
  await seedSession(page, validSession);
  await mockGas(page);

  await page.goto('/dinh-muc');

  await expect(page.getByRole('heading', { name: 'Định mức vật tư y tế', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'HOI SUC', exact: true })).toBeVisible();
  await expect(page.locator('.norms-department-list button')).toHaveCount(18);

  const search = page.getByRole('searchbox', { name: 'Tìm trong khoa/phòng đang chọn' });
  await search.fill('bang dinh vai');
  await expect(page.getByText('Băng dính vải', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.norms-result-announcement')).toContainText('Tìm thấy');

  await search.fill('');
  await page.getByRole('button', { name: 'Trang sau', exact: true }).click();
  await expect(page.locator('.norms-pagination')).toContainText('Trang 2');

  const ngoaiDepartment = page.locator('.norms-department-list button').filter({ hasText: 'NGOAI' });
  await expect(ngoaiDepartment).toHaveCount(1);
  const mobilePicker = page.getByLabel('Chọn khoa/phòng', { exact: true });
  if (await mobilePicker.isVisible()) {
    const value = await mobilePicker.locator('option').filter({ hasText: 'NGOAI' }).getAttribute('value');
    await mobilePicker.selectOption(value!);
  } else await ngoaiDepartment.click();
  await expect(page.getByRole('heading', { name: 'NGOAI', exact: true })).toBeVisible();
  await expect(page.locator('.norms-pagination')).toContainText('Trang 1');

  const maternityDepartment = page.locator('.norms-department-list button').filter({ hasText: 'Khoa sản' });
  if (await mobilePicker.isVisible()) {
    const value = await mobilePicker.locator('option').filter({ hasText: 'Khoa sản' }).getAttribute('value');
    await mobilePicker.selectOption(value!);
  } else await maternityDepartment.click();
  await expect(page.locator('.norms-data-warning')).toContainText('17');
});

test('norms lookup keeps common five-column sheets inside their ledger', async ({ page }) => {
  await page.setViewportSize({ width: 1511, height: 783 });
  await seedSession(page, validSession);
  await mockGas(page);

  await page.goto('/dinh-muc', { waitUntil: 'domcontentloaded' });

  const tableFrame = page.locator('.norms-table-frame');
  await tableFrame.waitFor({ state: 'visible', timeout: 20_000 });
  await expect.poll(() => tableFrame.evaluate(element => (
    element.scrollWidth - element.clientWidth
  ))).toBeLessThanOrEqual(1);
  await expect(page.locator('.norms-table tbody tr').first().locator('td').last()).toBeInViewport();
});

test('norms lookup hides technical Excel column labels', async ({ page }) => {
  await seedSession(page, validSession);
  await mockGas(page);

  await page.goto('/dinh-muc', { waitUntil: 'domcontentloaded' });

  const table = page.locator('.norms-table');
  await table.waitFor({ state: 'visible', timeout: 20_000 });
  await expect(table.getByRole('columnheader', { name: 'Hàng Excel', exact: true })).not.toBeVisible();
  await expect(table.getByRole('columnheader', { name: 'Cột A', exact: true })).not.toBeVisible();
  await expect(table.locator('thead th')).toHaveCount(6);
  await expect(table.locator('tbody tr').first()).toBeVisible();
});

test('repair form requires an explicit device selection on mobile', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSession(page, validSession);
  await mockGas(page);
  await page.goto('/requests?type=repair');
  const picker = page.locator('select.request-select').first();
  await expect(picker.locator('option[value="TB-001"]')).toBeAttached();
  await expect(picker).toHaveValue('');
});

test('device list fits a narrow phone and keeps details accessible', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await seedSession(page, validSession);
  await mockGas(page);
  await page.goto('/devices');
  const details = page.getByRole('button', { name: 'Xem chi tiết Máy thở QA', exact: true });
  await expect(details).toBeVisible();
  const box = await details.boundingBox();
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.x + box!.width).toBeLessThanOrEqual(360);
  await details.click();
  await expect(page).toHaveURL(/devices\/TB-001$/);
});

test('mobile navigation opens more and closes it after choosing a page', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSession(page, validSession);
  await mockGas(page);
  await page.goto('/devices');
  const nav = page.getByRole('navigation', { name: 'Điều hướng điện thoại' });
  await expect(nav).toBeVisible();
  await page.screenshot({ path: `test-results/mobile-navigation-${test.info().project.name}.png`, fullPage: true });
  await nav.getByRole('button', { name: 'Thêm' }).click();
  await page.locator('.sidebar').getByRole('link', { name: 'Thống kê & báo cáo' }).click();
  await expect(page).toHaveURL(/reports/);
  await expect(page.locator('.layout-scrim')).toHaveCount(0);
});

test('cancelling repair approval dialog does not approve the request', async ({ page }) => {
  let approvals = 0;
  await seedSession(page, validSession);
  await mockGas(page);
  await page.route('**/macros/s/**/exec*', async route => {
    const action = actionFromRoute(route);
    if (action === 'getRepairs') {
      await json(route, { success: true, data: [{ 'Thời gian': 'repair-1', 'Mã Máy/Thiết bị': 'TB-001', 'Trạng Thái': 'Chờ duyệt', 'Trạng thái': 'Chờ duyệt' }] });
    } else if (action === 'approveRepair') {
      approvals++;
      await json(route, { success: true });
    } else await route.fallback();
  });
  page.on('dialog', dialog => dialog.dismiss());
  await page.goto('/requests?type=repair');
  await page.getByRole('button', { name: /Tiếp nhận yêu cầu/ }).click();
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Duyệt yêu cầu sửa chữa' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(approvals).toBe(0);
  await page.getByRole('button', { name: 'Đồng ý', exact: true }).click();
  await dialog.getByLabel('Ghi chú duyệt (nếu có)').fill('Đã kiểm tra');
  await dialog.getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect.poll(() => approvals).toBe(1);
});

test('mobile menu supports Escape and returns focus to its trigger', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSession(page, validSession);
  await mockGas(page);
  await page.goto('/devices');
  const more = page.getByRole('navigation', { name: 'Điều hướng điện thoại' }).getByRole('button', { name: 'Thêm' });
  await more.click();
  await page.keyboard.press('Escape');
  await expect(page.locator('.layout-scrim')).toHaveCount(0);
  await expect(more).toBeFocused();
});

test('inventory does not restore a previous shared terminal history', async ({ page }) => {
  await seedSession(page, validSession);
  await mockGas(page);
  await page.addInitScript(() => localStorage.setItem('qlttb.inventory_runs', JSON.stringify([{ runId: 'private-run', name: 'Ca trực tài khoản khác', department: 'all', status: 'active', scans: [], createdAt: new Date().toISOString() }])));
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Kiểm kê QR', exact: true })).toBeVisible();
  await expect(page.locator('option').filter({ hasText: 'Ca trực tài khoản khác' })).toHaveCount(0);
});

test('device list exposes data freshness and allows retry after a read failure', async ({ page }) => {
  let failing = true;
  await seedSession(page, validSession);
  await mockGas(page);
  await page.route('**/macros/s/**/exec*', async route => {
    if (actionFromRoute(route) === 'getDevices' && failing) await json(route, { success: false, message: 'Tạm thời không tải được thiết bị' });
    else await route.fallback();
  });
  await page.goto('/devices');
  await expect(page.getByRole('alert').filter({ hasText: 'Tạm thời không tải được thiết bị' })).toBeVisible();
  failing = false;
  await page.getByRole('button', { name: 'Làm mới dữ liệu' }).click();
  await expect(page.getByText(/Cập nhật lúc:/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Xem chi tiết Máy thở QA', exact: true })).toBeVisible();
});

test('mobile image preparation reduces large photographs without changing videos', async ({ page }) => {
  await page.goto('/login');
  const result = await page.evaluate(async () => {
    const modulePath = '/src/utils/attachmentUtils.ts';
    const utility = await import(modulePath);
    if (typeof utility.optimizeImageForUpload !== 'function') return { available: false };
    const canvas = document.createElement('canvas');
    canvas.width = 2400; canvas.height = 1800;
    const context = canvas.getContext('2d')!;
    const pixels = context.createImageData(2400, 1800);
    let seed = 1234567;
    const nextByte = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return seed & 255; };
    for (let i = 0; i < pixels.data.length; i += 4) {
      pixels.data[i] = nextByte(); pixels.data[i + 1] = nextByte(); pixels.data[i + 2] = nextByte(); pixels.data[i + 3] = 255;
    }
    context.putImageData(pixels, 0, 0);
    const blob = await new Promise<Blob>(resolve => canvas.toBlob(value => resolve(value!), 'image/png'));
    const input = new File([blob], 'photo.png', { type: 'image/png' });
    const output = await utility.optimizeImageForUpload(input);
    const video = new File(['video'], 'video.mp4', { type: 'video/mp4' });
    const bitmap = await createImageBitmap(output);
    const result = { available: true, inputSize: input.size, outputSize: output.size, outputType: output.type, smaller: output.size < input.size, width: bitmap.width, videoUnchanged: await utility.optimizeImageForUpload(video) === video };
    bitmap.close();
    return result;
  });
  expect(result.available).toBe(true);
  expect(result.smaller, JSON.stringify(result)).toBe(true);
  expect(result.width).toBeLessThanOrEqual(1600);
  expect(result.videoUnchanged).toBe(true);
});

test('mobile device transfer dialog can be cancelled without submitting', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await seedSession(page, validSession);
  await mockGas(page);
  await page.goto('/devices/TB-001');
  await page.getByRole('button', { name: 'Điều chuyển khoa', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'Yêu cầu điều chuyển thiết bị' });
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});

test('inventory keeps its history when server deletion fails', async ({ page }) => {
  await seedSession(page, validSession);
  await mockGas(page);
  await page.route('**/macros/s/**/exec*', async route => {
    const action = actionFromRoute(route);
    if (action === 'getInventoryRuns') await json(route, { success: true, data: [{ runId: 'run-keep', name: 'Đợt kiểm kê giữ lại', department: 'all', createdAt: '2026-09-13', status: 'closed', sheetName: 'KK_TEST' }] });
    else if (action === 'deleteInventoryRun') await json(route, { success: false, message: 'Máy chủ chưa xóa được' });
    else await route.fallback();
  });
  await page.goto('/inventory');
  await expect(page.locator('option[value="run-keep"]')).toBeAttached();
  await page.getByRole('button', { name: 'Xóa đợt', exact: true }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Xác nhận', exact: true }).click();
  await expect(page.getByText('Máy chủ chưa xóa được', { exact: true })).toBeVisible();
  await expect(page.locator('option[value="run-keep"]')).toBeAttached();
});
