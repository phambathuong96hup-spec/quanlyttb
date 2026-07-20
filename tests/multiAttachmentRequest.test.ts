import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const utilityPath = 'src/utils/attachmentUtils.ts';

const makeFile = (name: string, type: string, size: number, lastModified = 1) => ({
  name,
  type,
  size,
  lastModified,
}) as File;

test('repair request supports an accessible batch of images and videos without the old delay', () => {
  const uploader = readFileSync('src/components/ui/FileUploader.tsx', 'utf8');
  const repair = readFileSync('src/pages/RepairRequest.tsx', 'utf8');
  const api = readFileSync('src/services/api.ts', 'utf8');
  const gas = readFileSync('gas/Code.gs', 'utf8');

  assert.match(uploader, /multiple=\{multiple\}/);
  assert.match(uploader, /onDrop=/);
  assert.match(uploader, /aria-live="polite"/);
  assert.match(uploader, /loading="lazy"/);
  assert.match(uploader, /aria-label=\{`Xóa \$\{file\.name\}`\}/);

  assert.match(repair, /const \[selectedFiles, setSelectedFiles\] = useState<File\[]>\(\[\]\)/);
  assert.match(repair, /accept=\{REPAIR_ATTACHMENT_ACCEPT\}/);
  assert.match(repair, /multiple/);
  assert.match(repair, /maxFiles=\{MAX_REPAIR_ATTACHMENTS\}/);
  assert.match(repair, /buildAttachmentPayloads/);
  assert.match(repair, /mutateRepairs\(currentRepairs =>/);
  assert.match(repair, /setActiveTab\('requests'\)/);
  assert.doesNotMatch(repair, /setTimeout\(\(\) => setActiveTab\('requests'\)/);

  assert.match(api, /export interface RepairAttachmentPayload/);
  assert.match(api, /attachments\?: RepairAttachmentPayload\[]/);
  assert.match(gas, /function uploadEvidenceFilesToDrive_/);
  assert.match(gas, /Array\.isArray\(payload\.attachments\)/);
  assert.match(gas, /MAX_REPAIR_ATTACHMENTS/);
  assert.match(gas, /evidenceLinksRows_/);
  assert.match(gas, /function matchesEvidenceSignature_/);
  assert.match(gas, /function discardEvidenceFiles_/);
  assert.match(gas, /function appendRepairAndGetRowId_/);
});

test('attachment selection accepts supported media and enforces count and size limits', async () => {
  assert.equal(existsSync(utilityPath), true, 'Chưa có tiện ích xử lý nhiều tệp minh chứng');
  const {
    DEFAULT_REPAIR_ATTACHMENT_LIMITS,
    mergeAttachmentSelection,
  } = await import('../src/utils/attachmentUtils.ts');

  const image = makeFile('mat-truoc.jpg', 'image/jpeg', 2 * 1024 * 1024);
  const video = makeFile('may-rung.mp4', 'video/mp4', 8 * 1024 * 1024);
  const unsupported = makeFile('ghi-chu.txt', 'text/plain', 100);
  const disguisedText = makeFile('gia-mao.txt', 'image/jpeg', 100);
  const mismatchedImage = makeFile('sai-mime.jpg', 'image/png', 100);
  const oversized = makeFile('qua-lon.mov', 'video/quicktime', 21 * 1024 * 1024);

  const firstSelection = mergeAttachmentSelection([], [image, video, unsupported, disguisedText, mismatchedImage, oversized], {
    ...DEFAULT_REPAIR_ATTACHMENT_LIMITS,
    maxFiles: 4,
    maxSizeMB: 20,
    maxTotalSizeMB: 24,
  });

  assert.deepEqual(firstSelection.files.map(file => file.name), ['mat-truoc.jpg', 'may-rung.mp4']);
  assert.equal(firstSelection.errors.length, 4);
  assert.match(firstSelection.errors.join(' '), /ghi-chu\.txt/);
  assert.match(firstSelection.errors.join(' '), /gia-mao\.txt/);
  assert.match(firstSelection.errors.join(' '), /sai-mime\.jpg/);
  assert.match(firstSelection.errors.join(' '), /qua-lon\.mov/);

  assert.equal(DEFAULT_REPAIR_ATTACHMENT_LIMITS.maxSizeMB, 12);
  assert.equal(DEFAULT_REPAIR_ATTACHMENT_LIMITS.maxTotalSizeMB, 16);

  const duplicateSelection = mergeAttachmentSelection(firstSelection.files, [image]);
  assert.equal(duplicateSelection.files.length, 2);
  assert.match(duplicateSelection.errors[0], /đã được chọn/i);

  const totalLimitSelection = mergeAttachmentSelection(
    [video],
    [makeFile('video-2.webm', 'video/webm', 9 * 1024 * 1024)],
    DEFAULT_REPAIR_ATTACHMENT_LIMITS
  );
  assert.equal(totalLimitSelection.files.length, 1);
  assert.match(totalLimitSelection.errors[0], /tổng dung lượng/i);
});

test('attachment payloads are prepared concurrently and preserve selection order', async () => {
  assert.equal(existsSync(utilityPath), true, 'Chưa có tiện ích chuẩn bị payload theo lô');
  const { buildAttachmentPayloads } = await import('../src/utils/attachmentUtils.ts');
  const files = [
    makeFile('anh-1.jpg', 'image/jpeg', 10),
    makeFile('video-1.mp4', 'video/mp4', 20),
  ];
  const started: string[] = [];
  let releaseReaders = () => undefined;
  const readerGate = new Promise<void>(resolve => { releaseReaders = resolve; });

  const pendingPayloads = buildAttachmentPayloads(files, async file => {
    started.push(file.name);
    await readerGate;
    return `base64-${file.name}`;
  });

  await Promise.resolve();
  assert.deepEqual(started, ['anh-1.jpg', 'video-1.mp4']);
  releaseReaders();

  assert.deepEqual(await pendingPayloads, [
    { name: 'anh-1.jpg', mimeType: 'image/jpeg', size: 10, content: 'base64-anh-1.jpg' },
    { name: 'video-1.mp4', mimeType: 'video/mp4', size: 20, content: 'base64-video-1.mp4' },
  ]);

  const inferredPayload = await buildAttachmentPayloads(
    [makeFile('ban-giao.mov', '', 30)],
    async () => 'base64-mov'
  );
  assert.equal(inferredPayload[0].mimeType, 'video/quicktime');
});

test('Apps Script rejects spoofed media and removes already uploaded siblings atomically', () => {
  const gas = readFileSync('gas/Code.gs', 'utf8');
  const trashedFileIds: string[] = [];
  let createdFileIndex = 0;
  const createdFiles = new Map<string, Record<string, unknown>>();
  const evidenceFolder = {
    createFile: () => {
      const id = `evidence-${++createdFileIndex}`;
      const file = {
        getId: () => id,
        getUrl: () => `https://drive.example/${id}`,
        setSharing: () => undefined,
        setTrashed: () => { trashedFileIds.push(id); },
      };
      createdFiles.set(id, file);
      return file;
    },
  };
  const spreadsheetFile = {
    getParents: () => ({ next: () => ({
      getFoldersByName: () => ({ hasNext: () => true, next: () => evidenceFolder }),
      createFolder: () => evidenceFolder,
    }) }),
  };
  const context: Record<string, unknown> = {
    console,
    Utilities: {
      base64Decode: (content: string) => Array.from(Buffer.from(content, 'base64')),
      newBlob: (bytes: number[], mimeType: string, name: string) => ({ bytes, mimeType, name }),
    },
    SpreadsheetApp: {
      openById: () => ({ getId: () => 'spreadsheet-file' }),
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFileById: (id: string) => id === 'spreadsheet-file' ? spreadsheetFile : createdFiles.get(id),
      getRootFolder: () => evidenceFolder,
    },
  };

  vm.runInNewContext(`${gas}\nglobalThis.__reportRepair = reportRepair_;`, context);
  const reportRepair = context.__reportRepair as (
    payload: Record<string, unknown>,
    actor: Record<string, unknown>
  ) => { success: boolean; attachmentFailures: string[] };
  const response = reportRepair({
    deviceId: 'TB-001',
    description: 'Kiểm thử upload nguyên tử',
    imageName: 'hien-trang.jpg',
    imageMimeType: 'image/jpeg',
    imageContent: Buffer.from([0xFF, 0xD8, 0xFF, 0x00]).toString('base64'),
    attachments: [{
      name: 'gia-mao.png',
      mimeType: 'image/png',
      content: Buffer.from('not-a-png').toString('base64'),
    }],
  }, {});

  assert.equal(response.success, false);
  assert.deepEqual(Array.from(response.attachmentFailures), ['gia-mao.png']);
  assert.deepEqual(trashedFileIds, ['evidence-1']);
});
