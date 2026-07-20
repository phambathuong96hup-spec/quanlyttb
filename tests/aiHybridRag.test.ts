import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const expectedFiles = [
  '05_2022_TT-BYT_499978.docx',
  '19_2021_TT-BYT_495904.docx',
  '98_2021_ND-CP_493940.docx',
  '117_2020_ND-CP_398159.docx',
  '7115_QD-BYT_332675.docx',
  'ĐỊNH MỨC 2026 10.7.26.xlsx',
];

test('AI service uses the LightRAG upload and referenced streaming APIs', () => {
  const source = readFileSync('src/services/aiService.ts', 'utf8');

  assert.match(source, /\/documents\/upload/);
  assert.doesNotMatch(source, /\/documents\/file/);
  assert.match(source, /include_references:\s*true/);
  assert.match(source, /include_chunk_content:\s*true/);
  assert.match(source, /queryLocalLegalRag/);
  assert.match(source, /const controller = new AbortController\(\)/);
  assert.match(source, /trimmedBuffer\.startsWith\('\{'\)/);
  assert.match(source, /handlePayload\(JSON\.parse\(trimmedBuffer\)/);
  assert.doesNotMatch(source, /eslint-disable-next-line no-constant-condition/);
});

test('AI health check requires indexed remote documents, not only a live server', () => {
  const source = readFileSync('src/services/aiService.ts', 'utf8');

  assert.match(source, /\/documents\/status_counts/);
  assert.match(source, /processed/i);
  assert.doesNotMatch(source, /return res\.ok;\s*}\s*catch/s);
});

test('RAG index includes the regulatory documents and the 2026 norms workbook', () => {
  const indexPath = 'public/rag/legal-knowledge.json';
  assert.equal(existsSync(indexPath), true);

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
    documents: Array<{ fileName: string; charLength: number }>;
    chunks: Array<{ text: string; fileName: string; sectionTitle: string }>;
  };

  assert.equal(index.documents.length, 6);
  assert.ok(index.chunks.length > 600);
  expectedFiles.forEach((fileName) => {
    assert.ok(index.documents.some((document) => document.fileName === fileName));
    assert.ok(index.chunks.some((chunk) => chunk.fileName === fileName && chunk.text.length > 200));
  });

  const workbook = index.documents.find(
    (document) => document.fileName === 'ĐỊNH MỨC 2026 10.7.26.xlsx',
  );
  assert.ok(workbook && workbook.charLength > 100_000);

  const workbookChunks = index.chunks.filter(
    (chunk) => chunk.fileName === 'ĐỊNH MỨC 2026 10.7.26.xlsx',
  );
  ['HOI SUC', 'Xét nghiệm', 'Khoa sản', 'PK Thanh hà'].forEach((sheetName) => {
    assert.ok(
      workbookChunks.some((chunk) => chunk.sectionTitle.includes(sheetName)),
      `Missing indexed sheet ${sheetName}`,
    );
  });

  const laboratorySections = new Set(
    workbookChunks
      .filter((chunk) => chunk.sectionTitle.includes('Xét nghiệm'))
      .map((chunk) => chunk.sectionTitle),
  );
  assert.ok(
    laboratorySections.size > 1,
    'Large worksheets must expose row-scoped sections so relevant chunks are not deduplicated',
  );
});
