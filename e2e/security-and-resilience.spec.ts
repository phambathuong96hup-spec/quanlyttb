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

const mockGas = async (page: Page, options: { delayedHistoryMs?: number; invalidSession?: boolean } = {}) => {
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
    await json(route, { success: true, data: [] });
  });
};

test('a forged client session without a server token cannot open protected routes', async ({ page }) => {
  await seedSession(page, { username: 'forged-admin', role: 'Admin', name: 'Forged Admin' });
  await mockGas(page);

  await page.goto('/dashboard');

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('button', { name: 'Đăng nhập' })).toBeVisible();
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
  await ngoaiDepartment.click();
  await expect(page.getByRole('heading', { name: 'NGOAI', exact: true })).toBeVisible();
  await expect(page.locator('.norms-pagination')).toContainText('Trang 1');

  const maternityDepartment = page.locator('.norms-department-list button').filter({ hasText: 'Khoa sản' });
  await maternityDepartment.click();
  await expect(page.locator('.norms-data-warning')).toContainText('17');
});
