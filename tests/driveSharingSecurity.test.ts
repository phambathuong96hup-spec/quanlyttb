import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

test('Drive sharing policy defaults to PRIVATE/VIEW and removes hardcoded ANYONE_WITH_LINK in uploads', () => {
  const source = readFileSync('gas/Code.gs', 'utf8');

  // Verify functions exist
  assert.match(source, /function getDriveSharingPolicy_\(\)/);
  assert.match(source, /function assertFolderPrivate_\(folder\)/);
  assert.match(source, /function applyFileAccessPolicy_\(file, folder\)/);

  // Verify default is PRIVATE and uses VIEW permission
  assert.match(source, /return 'PRIVATE';/);
  assert.match(source, /DriveApp\.Access\.PRIVATE,\s*DriveApp\.Permission\.VIEW/);

  // Verify uploads use applyFileAccessPolicy_ instead of hardcoded ANYONE_WITH_LINK
  const evidenceUploadSection = source.match(/function uploadEvidenceFilesToDrive_[\s\S]*?\n\}/)?.[0] || '';
  const docUploadSection = source.match(/function uploadDocumentFile_[\s\S]*?\n\}/)?.[0] || '';

  assert.match(evidenceUploadSection, /applyFileAccessPolicy_\(createdFile,\s*folder\)/);
  assert.doesNotMatch(evidenceUploadSection, /createdFile\.setSharing\(DriveApp\.Access\.ANYONE_WITH_LINK/);

  assert.match(docUploadSection, /applyFileAccessPolicy_\(createdFile,\s*folder\)/);
  assert.doesNotMatch(docUploadSection, /file\.setSharing\(DriveApp\.Access\.ANYONE_WITH_LINK/);
});

test('applyFileAccessPolicy_ sets PRIVATE/VIEW and fail-closed throws if folder is public', () => {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  let setSharingArgs: unknown[] = [];

  const fakeFile = {
    setSharing: (access: unknown, perm: unknown) => {
      setSharingArgs = [access, perm];
    },
    getSharingAccess: () => 'PRIVATE',
  };

  const fakeFolderPrivate = {
    getParents: () => ({ hasNext: () => false }),
    getName: () => 'HinhAnhMinhChung',
    getSharingAccess: () => 'PRIVATE',
  };

  const fakeFolderPublic = {
    getName: () => 'HinhAnhMinhChung',
    getSharingAccess: () => 'ANYONE_WITH_LINK',
  };

  const context: Record<string, unknown> = {
    console: {
      ...console,
      warn: () => {},
      error: () => {},
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => null,
      }),
    },
    DriveApp: {
      Access: {
        ANYONE_WITH_LINK: 'ANYONE_WITH_LINK',
        ANYONE: 'ANYONE',
        PRIVATE: 'PRIVATE',
        DOMAIN_WITH_LINK: 'DOMAIN_WITH_LINK',
      },
      Permission: {
        VIEW: 'VIEW',
        EDIT: 'EDIT',
        COMMENT: 'COMMENT',
      },
    },
  };

  vm.runInNewContext(
    `${gas}\nglobalThis.__apply = applyFileAccessPolicy_;\nglobalThis.__assertPrivate = assertFolderPrivate_;`,
    context
  );

  const applyPolicy = context.__apply as (file: unknown, folder: unknown) => void;
  const assertPrivate = context.__assertPrivate as (folder: unknown) => void;

  // 1. Private folder succeeds with PRIVATE and VIEW
  applyPolicy(fakeFile, fakeFolderPrivate);
  assert.equal(setSharingArgs[0], 'PRIVATE');
  assert.equal(setSharingArgs[1], 'VIEW');

  // 2. Public folder fails closed (throws error)
  assert.throws(() => {
    assertPrivate(fakeFolderPublic);
  }, /Từ chối upload: Thư mục lưu trữ đang mở chia sẻ công khai/);

  assert.throws(() => {
    applyPolicy(fakeFile, fakeFolderPublic);
  }, /Từ chối upload: Thư mục lưu trữ đang mở chia sẻ công khai/);

  // 3. Missing getSharingAccess throws fail-closed error (Shared Drive unsupported)
  const fakeFolderMissingMethod = { getName: () => 'SharedDriveFolder' };
  assert.throws(() => {
    assertPrivate(fakeFolderMissingMethod);
  }, /thiếu phương thức getSharingAccess/);

  // 4. Folder read failure throws fail-closed error
  const fakeFolderReadError = {
    getName: () => 'ErrorFolder',
    getSharingAccess: () => {
      throw new Error('DriveApp RPC timeout');
    },
  };
  assert.throws(() => {
    assertPrivate(fakeFolderReadError);
  }, /Lỗi khi đọc quyền chia sẻ/);

  // 5. Folder has public ancestor -> throws fail-closed error
  const fakeFolderWithPublicParent = {
    getName: () => 'SubFolder',
    getSharingAccess: () => 'PRIVATE',
    getParents: () => {
      let yielded = false;
      return {
        hasNext: () => !yielded,
        next: () => {
          yielded = true;
          return {
            getName: () => 'PublicParent',
            getSharingAccess: () => 'ANYONE_WITH_LINK',
            getParents: () => ({ hasNext: () => false }),
          };
        },
      };
    },
  };
  assert.throws(() => {
    assertPrivate(fakeFolderWithPublicParent);
  }, /Thư mục cha\/tổ tiên đang mở chia sẻ công khai/);

  // 6. File missing setSharing or getSharingAccess throws fail-closed error
  assert.throws(() => {
    applyPolicy({ getSharingAccess: () => 'PRIVATE' }, fakeFolderPrivate);
  }, /Tệp không hỗ trợ thiết lập hoặc đọc quyền chia sẻ/);

  // 7. File retaining public access after setSharing throws fail-closed error
  const fakeFileStuckPublic = {
    setSharing: () => {},
    getSharingAccess: () => 'ANYONE_WITH_LINK',
  };
  assert.throws(() => {
    applyPolicy(fakeFileStuckPublic, fakeFolderPrivate);
  }, /Tệp vẫn mang quyền chia sẻ công khai/);
});

test('uploadDocumentFile_ cleans up orphan file on failure and throws', () => {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  let trashed = false;

  const fakeFolder = {
    getParents: () => ({ hasNext: () => false }),
    getSharingAccess: () => 'PRIVATE',
    createFile: () => ({
      getUrl: () => 'https://drive.google.com/test',
      setSharing: () => {
        throw new Error('Permission denied error');
      },
      setTrashed: (val: boolean) => {
        trashed = val;
      },
      getSharingAccess: () => 'PRIVATE',
    }),
  };

  const context: Record<string, unknown> = {
    console: {
      ...console,
      error: () => {},
    },
    SpreadsheetApp: {
      openById: () => ({
        getId: () => 'test-id',
      }),
    },
    DriveApp: {
      getFileById: () => ({
        getParents: () => ({
          next: () => ({
            getFoldersByName: () => ({
              hasNext: () => true,
              next: () => fakeFolder,
            }),
          }),
        }),
      }),
      getRootFolder: () => fakeFolder,
      Access: { PRIVATE: 'PRIVATE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
    },
    Utilities: {
      base64Decode: () => [],
      newBlob: () => ({}),
    },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: () => 'PRIVATE',
      }),
    },
  };

  vm.runInNewContext(
    `${gas}\nglobalThis.__uploadDoc = uploadDocumentFile_;`,
    context
  );

  const uploadDoc = context.__uploadDoc as (payload: unknown, fallback: string) => string;

  assert.throws(() => {
    uploadDoc({ fileContent: 'dummyBase64', fileName: 'test.pdf' }, '');
  }, /Tải tài liệu kiểm định thất bại/);

  // File was created but error occurred during applyFileAccessPolicy_ -> must be trashed
  assert.equal(trashed, true);
});

test('Drive checks every ancestor and fails closed on missing ancestry methods', () => {
  const context = vm.createContext({
    console,
    DriveApp: { Access: { PRIVATE: 'PRIVATE', ANYONE: 'ANYONE', ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' } },
  });
  vm.runInContext(readFileSync('gas/Code.gs', 'utf8'), context);
  const check = context.assertFolderPrivate_ as (folder: unknown) => void;
  const folder = (access: string, parents: unknown[] = []) => ({
    getSharingAccess: () => access,
    getParents: () => {
      let index = 0;
      return { hasNext: () => index < parents.length, next: () => parents[index++] };
    },
  });
  assert.throws(() => check(folder('PRIVATE', [folder('PRIVATE', [folder('ANYONE_WITH_LINK')])])));
  assert.throws(() => check({ getSharingAccess: () => 'PRIVATE' }));
  assert.throws(() => check(folder('PRIVATE', [{}])));
  check(folder('PRIVATE', [folder('PRIVATE')]));
});

test('sanitized demoDevices.json exists and decouples internal snapshot in production Vite builds', async () => {
  assert.equal(existsSync('src/data/demoDevices.json'), true);
  const demoContent = JSON.parse(readFileSync('src/data/demoDevices.json', 'utf8'));
  assert.ok(Array.isArray(demoContent));
  assert.ok(demoContent.length > 0);

  // Demo devices must have sanitized IDs and names
  assert.ok(demoContent.every((d: Record<string, unknown>) => String(d.id || '').startsWith('DEMO-')));

  // Test real vite.config.ts resolveId plugin logic in production mode
  const viteConfigModule = await import('../vite.config.ts');
  const config = typeof viteConfigModule.default === 'function'
    ? (viteConfigModule.default as (env: { mode: string }) => { plugins: Array<{ name: string; resolveId?: (source: string) => string | null }> })({ mode: 'production' })
    : (viteConfigModule.default as { plugins: Array<{ name: string; resolveId?: (source: string) => string | null }> });

  const decouplerPlugin = config.plugins.find(p => p.name === 'snapshot-decoupler');
  assert.ok(decouplerPlugin, 'snapshot-decoupler plugin must exist in vite config');
  assert.ok(typeof decouplerPlugin.resolveId === 'function');

  // Any import resolving to devices.snapshot.json must resolve directly to demoDevices.json
  const resolved = decouplerPlugin.resolveId!('../data/devices.snapshot.json');
  assert.ok(resolved, 'resolveId must intercept snapshot import');
  assert.ok(resolved.endsWith('demoDevices.json'), `Expected demoDevices.json but got: ${resolved}`);
  assert.equal(resolved.includes('devices.snapshot.json'), false);
});
