import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

type AddUserFn = (payload: Record<string, unknown>, actor: Record<string, unknown>) => { success: boolean; message: string; user?: Record<string, unknown> };
type CheckUrlFn = (url: string) => Promise<{ success: boolean; message: string }>;
type UserApiFn = (payload: Record<string, unknown>) => Promise<{ success: boolean; message?: string; user?: Record<string, unknown> }>;

test('gas Code.gs includes secured addUser route and admin guards', () => {
  const codeGs = readFileSync('gas/Code.gs', 'utf8');

  // Verify addUser route is protected by requireAdmin_
  assert.match(codeGs, /case\s+'addUser':/);
  assert.match(codeGs, /actor\s*=\s*requireAdmin_\(payload\);/);
  assert.match(codeGs, /addUser_\(payload,\s*actor\)/);
  assert.match(codeGs, /function\s+addUser_\(payload,\s*actor\)/);
  assert.match(codeGs, /function\s+editUser_\(payload\)/);
});

test('addUser_ executes correctly with English and Vietnamese headers and rejects missing columns or missing PIN', () => {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  const gasTree = ts.createSourceFile('gas.js', gas, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const targetFunctions = ['addUser_', 'normalizeHeader_', 'normalize_', 'pinFieldKeys_'];
  const functionCode = gasTree.statements
    .filter(node => ts.isFunctionDeclaration(node) && targetFunctions.includes(node.name?.text || ''))
    .map(node => node.getText(gasTree))
    .join('\n');

  // 1. Test with English column headers
  let appendedRow: unknown[] = [];
  const englishHeaders = ['Username', 'Password', 'Role', 'Name', 'Email', 'Department', 'Status'];
  const englishContext = vm.createContext({
    findUser_: () => null,
    userSheet_: () => ({
      getLastColumn: () => englishHeaders.length,
      getRange: () => ({ getValues: () => [englishHeaders] }),
      appendRow: (r: unknown[]) => { appendedRow = r; },
    }),
    hashPin_: (pin: string) => `hashed:${pin}`,
    invalidateUserRowsCache_: () => {},
    logActivity_: () => {},
  });
  vm.runInContext(functionCode, englishContext);

  const resEnglish = (englishContext as { addUser_: AddUserFn }).addUser_({
    username: 'john_doe',
    pin: '654321',
    fullName: 'John Doe',
    department: 'Khoa Dược',
    role: 'User',
    email: 'john@example.com',
  }, {});

  assert.equal(resEnglish.success, true);
  assert.equal(appendedRow[0], 'john_doe');
  assert.equal(appendedRow[1], 'hashed:654321');
  assert.equal(appendedRow[2], 'User');
  assert.equal(appendedRow[3], 'John Doe');
  assert.equal(appendedRow[4], 'john@example.com');
  assert.equal(appendedRow[5], 'Khoa Dược');
  assert.equal(appendedRow[6], 'active');

  // 2. Test with Vietnamese column headers
  let appendedVnRow: unknown[] = [];
  const vnHeaders = ['Tên đăng nhập', 'Mã PIN', 'Quyền hạn', 'Họ và Tên', 'Email', 'Khoa/Phòng', 'Trạng thái'];
  const vnContext = vm.createContext({
    findUser_: () => null,
    userSheet_: () => ({
      getLastColumn: () => vnHeaders.length,
      getRange: () => ({ getValues: () => [vnHeaders] }),
      appendRow: (r: unknown[]) => { appendedVnRow = r; },
    }),
    hashPin_: (pin: string) => `hashed:${pin}`,
    invalidateUserRowsCache_: () => {},
    logActivity_: () => {},
  });
  vm.runInContext(functionCode, vnContext);

  const resVn = (vnContext as { addUser_: AddUserFn }).addUser_({
    username: 'bs_minh',
    pin: '987654',
    fullName: 'BS. Nguyễn Văn Minh',
    department: 'Khoa Cấp Cứu',
    role: 'Admin',
    email: 'minh@example.com',
  }, {});

  assert.equal(resVn.success, true);
  assert.equal(appendedVnRow[0], 'bs_minh');
  assert.equal(appendedVnRow[1], 'hashed:987654');
  assert.equal(appendedVnRow[2], 'Admin');
  assert.equal(appendedVnRow[3], 'BS. Nguyễn Văn Minh');
  assert.equal(appendedVnRow[4], 'minh@example.com');
  assert.equal(appendedVnRow[5], 'Khoa Cấp Cứu');
  assert.equal(appendedVnRow[6], 'active');

  // 3. Test rejection when PIN is omitted (no common default PIN)
  let rejectedPinRow: unknown[] | null = null;
  const noPinContext = vm.createContext({
    findUser_: () => null,
    userSheet_: () => ({
      getLastColumn: () => englishHeaders.length,
      getRange: () => ({ getValues: () => [englishHeaders] }),
      appendRow: (r: unknown[]) => { rejectedPinRow = r; },
    }),
    hashPin_: (pin: string) => `hashed:${pin}`,
  });
  vm.runInContext(functionCode, noPinContext);

  const resNoPin = (noPinContext as { addUser_: AddUserFn }).addUser_({
    username: 'no_pin_user',
    pin: '',
    fullName: 'No PIN',
  }, {});

  assert.equal(resNoPin.success, false);
  assert.match(resNoPin.message, /mã PIN/i);
  assert.equal(rejectedPinRow, null);

  // 4. Test rejection when sheet is missing mandatory account or PIN columns
  let rejectedColRow: unknown[] | null = null;
  const invalidHeaders = ['Họ và Tên', 'Email', 'Khoa/Phòng', 'Trạng thái'];
  const missingColContext = vm.createContext({
    findUser_: () => null,
    userSheet_: () => ({
      getLastColumn: () => invalidHeaders.length,
      getRange: () => ({ getValues: () => [invalidHeaders] }),
      appendRow: (r: unknown[]) => { rejectedColRow = r; },
    }),
    hashPin_: (pin: string) => `hashed:${pin}`,
  });
  vm.runInContext(functionCode, missingColContext);

  const resMissingCol = (missingColContext as { addUser_: AddUserFn }).addUser_({
    username: 'col_user',
    pin: '123456',
    fullName: 'Col User',
  }, {});

  assert.equal(resMissingCol.success, false);
  assert.match(resMissingCol.message, /thiếu cột bắt buộc/i);
  assert.equal(rejectedColRow, null);

  // 5. Test rejection when username already exists
  const duplicateContext = vm.createContext({
    findUser_: () => ({ username: 'existing_user' }),
    userSheet_: () => ({
      getLastColumn: () => englishHeaders.length,
      getRange: () => ({ getValues: () => [englishHeaders] }),
      appendRow: () => {},
    }),
  });
  vm.runInContext(functionCode, duplicateContext);

  const resDuplicate = (duplicateContext as { addUser_: AddUserFn }).addUser_({
    username: 'existing_user',
    pin: '123456',
  }, {});

  assert.equal(resDuplicate.success, false);
  assert.match(resDuplicate.message, /đã tồn tại/i);
});

test('testAppsScriptConnection strictly validates operational response structure and rejects invalid probes', async () => {
  const apiSource = readFileSync('src/services/api.ts', 'utf8');
  const tree = ts.createSourceFile('api.ts', apiSource, ts.ScriptTarget.Latest, true);
  const targetDeclarations = ['testAppsScriptConnection'];
  const declCode = tree.statements
    .filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => targetDeclarations.includes(d.name.getText(tree))))
    .map(node => node.getText(tree).replace(/^export /, ''))
    .join('\n');
  const transpiled = ts.transpileModule(declCode, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

  // Case 1: Server returns business failure { success: false, message: 'Action không hợp lệ: getOperationalState' }
  const failureContext = vm.createContext({
    safeFetch: async () => ({ success: false, message: 'Action không hợp lệ: getOperationalState' }),
    getAuthPayload: () => ({ actorUsername: 'admin', sessionToken: 'token' }),
  });
  vm.runInContext(`${transpiled}\nglobalThis.check = testAppsScriptConnection;`, failureContext);

  const resFailure = await (failureContext as { check: CheckUrlFn }).check('https://script.google.com/macros/s/TEST/exec');
  assert.equal(resFailure.success, false);
  assert.equal(resFailure.message, 'Action không hợp lệ: getOperationalState');

  // Case 2: Server returns standard valid envelope { success: true, data: { workflowOverrides: {}, costEntries: [] } }
  const successContext = vm.createContext({
    safeFetch: async () => ({ success: true, data: { workflowOverrides: {}, costEntries: [] } }),
    getAuthPayload: () => ({ actorUsername: 'admin', sessionToken: 'token' }),
  });
  vm.runInContext(`${transpiled}\nglobalThis.check = testAppsScriptConnection;`, successContext);

  const resSuccess = await (successContext as { check: CheckUrlFn }).check('https://script.google.com/macros/s/TEST/exec');
  assert.equal(resSuccess.success, true);
  assert.match(resSuccess.message, /thành công/i);

  // Case 3: Server returns valid legacy direct response { success: true, workflowOverrides: {}, costEntries: [] }
  const directContext = vm.createContext({
    safeFetch: async () => ({ success: true, workflowOverrides: {}, costEntries: [] }),
    getAuthPayload: () => ({ actorUsername: 'admin', sessionToken: 'token' }),
  });
  vm.runInContext(`${transpiled}\nglobalThis.check = testAppsScriptConnection;`, directContext);

  const resDirect = await (directContext as { check: CheckUrlFn }).check('https://script.google.com/macros/s/TEST/exec');
  assert.equal(resDirect.success, true);

  // Case 4: Invalid probes must all be strictly rejected
  const invalidProbes = [
    { success: true, data: null },
    { success: true, data: 42 },
    { success: true, data: [] },
    { data: { workflowOverrides: 'invalid' } },
    { workflowOverrides: null, costEntries: 42 },
    { success: true, data: { workflowOverrides: null, costEntries: [] } },
    { success: true, data: { workflowOverrides: {}, costEntries: 'not-array' } },
  ];

  for (const probe of invalidProbes) {
    const probeContext = vm.createContext({
      safeFetch: async () => probe,
      getAuthPayload: () => ({ actorUsername: 'admin', sessionToken: 'token' }),
    });
    vm.runInContext(`${transpiled}\nglobalThis.check = testAppsScriptConnection;`, probeContext);
    const resProbe = await (probeContext as { check: CheckUrlFn }).check('https://script.google.com/macros/s/TEST/exec');
    assert.equal(resProbe.success, false, `Probe must be rejected: ${JSON.stringify(probe)}`);
    assert.match(resProbe.message, /không đúng cấu trúc dữ liệu/i);
  }

  // Case 5: Invalid URL format
  const resBadUrl = await (successContext as { check: CheckUrlFn }).check('https://invalid.url.com/exec');
  assert.equal(resBadUrl.success, false);
  assert.match(resBadUrl.message, /URL không đúng định dạng/i);
});

test('addUser and editUser in api.ts preserve Admin role and real name from backend response', async () => {
  const apiSource = readFileSync('src/services/api.ts', 'utf8');
  const tree = ts.createSourceFile('api.ts', apiSource, ts.ScriptTarget.Latest, true);
  const targetDeclarations = ['asText', 'getText', 'addUser', 'editUser'];
  const declCode = tree.statements
    .filter(node => ts.isVariableStatement(node) && node.declarationList.declarations.some(d => targetDeclarations.includes(d.name.getText(tree))))
    .map(node => node.getText(tree).replace(/^export /, ''))
    .join('\n');
  const transpiled = ts.transpileModule(declCode, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;

  const context = vm.createContext({
    postAction: async () => ({
      success: true,
      user: {
        username: 'new-admin',
        role: 'Admin',
        name: 'Synthetic Admin',
        email: 'qa@example.test',
        department: 'QA',
      },
    }),
  });
  vm.runInContext(`${transpiled}\nglobalThis.addUser = addUser;\nglobalThis.editUser = editUser;`, context);

  const resAdd = await (context as { addUser: UserApiFn }).addUser({ username: 'new-admin' });
  assert.equal(resAdd.success, true);
  assert.equal(resAdd.user?.role, 'Admin');
  assert.equal(resAdd.user?.name, 'Synthetic Admin');
  assert.equal(resAdd.user?.username, 'new-admin');
  assert.equal(resAdd.user?.department, 'QA');

  const resEdit = await (context as { editUser: UserApiFn }).editUser({ username: 'new-admin' });
  assert.equal(resEdit.success, true);
  assert.equal(resEdit.user?.role, 'Admin');
  assert.equal(resEdit.user?.name, 'Synthetic Admin');
});

test('admin settings UI strictly omits default reset button and enforces URL verification before activate', () => {
  const adminPage = readFileSync('src/pages/AdminSettings.tsx', 'utf8');

  // Must have user & department assignment features
  assert.match(adminPage, /Quản trị Hệ thống (&amp;|&) Phân khoa/);
  assert.match(adminPage, /Phân khoa/);
  assert.match(adminPage, /Thêm tài khoản/);
  assert.match(adminPage, /testAppsScriptConnection/);
  assert.match(adminPage, /setCustomAppsScriptUrl/);

  // MUST NOT contain restore/reset default buttons per user command
  assert.doesNotMatch(adminPage, /Khôi phục mặc định/i);
  assert.doesNotMatch(adminPage, /Đặt lại mặc định/i);
  assert.doesNotMatch(adminPage, /Reset to default/i);

  // Enforces URL verification before activation
  assert.match(adminPage, /disabled=\{isSavingUrl\s*\|\|\s*!isUrlVerified\}/);
  assert.match(adminPage, /verifiedUrl/);

  // Explains browser localStorage scope rather than hospital-wide
  assert.match(adminPage, /lưu và áp dụng trên trình duyệt hiện tại/);

  // PIN input in Add User modal is required
  assert.match(adminPage, /Mã PIN khởi tạo \*/);
});

test('routing and navigation strictly enforce admin authorization for /admin', () => {
  const appSource = readFileSync('src/App.tsx', 'utf8');
  const sidebarSource = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
  const topNavSource = readFileSync('src/components/layout/TopNav.tsx', 'utf8');

  // App.tsx route
  assert.match(appSource, /path="admin"\s+element=\{<PrivateRoute roles=\{?\['admin'\]\}?>/);

  // Sidebar.tsx
  assert.match(sidebarSource, /isAdmin\s*&&/);
  assert.match(sidebarSource, /to="\/admin"/);
  assert.match(sidebarSource, /Quản trị &amp; Phân khoa/);

  // TopNav.tsx
  assert.match(topNavSource, /isAdmin\s*&&/);
  assert.match(topNavSource, /navigate\('\/admin'\)/);
});

test('Account alias header supports full lifecycle: create, read, find, login, and duplicate rejection', () => {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  const gasTree = ts.createSourceFile('gas.js', gas, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const targetFunctions = [
    'userFieldAliases_',
    'addUser_',
    'userUsername_',
    'getUserField_',
    'findUser_',
    'findLoginUser_',
    'normalize_',
    'normalizeHeader_',
    'pinFieldKeys_'
  ];
  const functionCode = gasTree.statements
    .filter(node => ts.isFunctionDeclaration(node) && targetFunctions.includes(node.name?.text || ''))
    .map(node => node.getText(gasTree))
    .join('\n');

  const headers = ['Account', 'Password', 'Role', 'Name', 'Email', 'Department', 'Status'];
  const rows: unknown[][] = [];

  const gasContext = vm.createContext({
    USER_FIELD_ALIASES: undefined,
    userSheet_: () => ({
      getLastColumn: () => headers.length,
      getRange: () => ({ getValues: () => [headers] }),
      appendRow: (r: unknown[]) => { rows.push(r); },
    }),
    getUserRows_: () => rows.map(r => Object.fromEntries(headers.map((h, i) => [h, r[i]]))),
    hashPin_: (pin: string) => `hashed:${pin}`,
    invalidateUserRowsCache_: () => {},
    logActivity_: () => {},
  });

  vm.runInContext(functionCode, gasContext);

  const ctx = gasContext as {
    addUser_: AddUserFn;
    userUsername_: (u: Record<string, unknown>) => string;
    findUser_: (username: string) => Record<string, unknown> | null;
    findLoginUser_: (users: Record<string, unknown>[], username: string) => Record<string, unknown> | null;
    getUserRows_: () => Record<string, unknown>[];
  };

  // 1. Create account with Account header
  const createRes = ctx.addUser_({
    username: 'bs_an',
    pin: '123456',
    fullName: 'BS. Nguyễn Văn An',
    department: 'Khoa Ngoại',
    role: 'User',
    email: 'an@benhvien.vn'
  }, {});

  assert.equal(createRes.success, true);
  assert.equal(rows.length, 1);
  assert.equal(rows[0][0], 'bs_an');
  assert.equal(rows[0][1], 'hashed:123456');

  // 2. Read back with userUsername_
  const storedUser = Object.fromEntries(headers.map((h, i) => [h, rows[0][i]]));
  const readBackUsername = ctx.userUsername_(storedUser);
  assert.equal(readBackUsername, 'bs_an', 'userUsername_ must recognize Account header');

  // 3. Find user with findUser_
  const foundUser = ctx.findUser_('bs_an');
  assert.ok(foundUser, 'findUser_ must find user stored under Account column');
  assert.equal(foundUser?.Name, 'BS. Nguyễn Văn An');

  // 4. Find user for login with findLoginUser_
  const loginUser = ctx.findLoginUser_(ctx.getUserRows_(), 'bs_an');
  assert.ok(loginUser, 'findLoginUser_ must match username from Account column');

  // 5. Attempt duplicate creation -> must reject and not append new row
  const dupRes = ctx.addUser_({
    username: 'bs_an',
    pin: '999999',
    fullName: 'BS. Trùng Tên',
  }, {});

  assert.equal(dupRes.success, false);
  assert.match(dupRes.message, /đã tồn tại/i);
  assert.equal(rows.length, 1, 'Must NOT append duplicate row');
});
