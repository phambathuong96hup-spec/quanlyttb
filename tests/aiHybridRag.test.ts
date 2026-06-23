import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const expectedFiles = [
  '05_2022_TT-BYT_499978.docx',
  '19_2021_TT-BYT_495904.docx',
  '98_2021_ND-CP_493940.docx',
  '117_2020_ND-CP_398159.docx',
  '7115_QD-BYT_332675.docx',
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

test('legal RAG index is built from the five regulatory DOCX files', () => {
  const indexPath = 'public/rag/legal-knowledge.json';
  assert.equal(existsSync(indexPath), true);

  const index = JSON.parse(readFileSync(indexPath, 'utf8')) as {
    documents: Array<{ fileName: string }>;
    chunks: Array<{ text: string; fileName: string }>;
  };

  assert.equal(index.documents.length, 5);
  assert.ok(index.chunks.length > 100);
  expectedFiles.forEach((fileName) => {
    assert.ok(index.documents.some((document) => document.fileName === fileName));
    assert.ok(index.chunks.some((chunk) => chunk.fileName === fileName && chunk.text.length > 200));
  });
});
