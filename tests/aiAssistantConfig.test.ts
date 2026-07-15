import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('AI page uses a validated VITE_AI_API_URL and shows a clear unavailable state', () => {
  const page = readFileSync('src/pages/AIAssistant.tsx', 'utf8');
  const service = readFileSync('src/services/aiService.ts', 'utf8');

  assert.doesNotMatch(page, /https?:\/\//);
  assert.match(page, /getAIBackendInfo/);
  assert.match(page, /Trợ lý AI chưa khả dụng/);
  assert.match(page, /VITE_AI_API_URL/);
  assert.match(service, /export const normalizeAIBaseUrl/);
  assert.match(service, /url\.protocol === 'https:'/);
  assert.match(service, /localhost|127\.0\.0\.1/);
});

test('AI iframe keeps query functionality with a constrained sandbox', () => {
  const page = readFileSync('src/pages/AIAssistant.tsx', 'utf8');

  assert.match(page, /sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"/);
  assert.match(page, /referrerPolicy="no-referrer"/);
  assert.match(page, /allow="clipboard-write"/);
  assert.doesNotMatch(page, /clipboard-read|fullscreen/);
});

test('remote-only AI document APIs fail closed when no valid backend URL exists', () => {
  const service = readFileSync('src/services/aiService.ts', 'utf8');

  assert.match(service, /const requireAIBaseUrl/);
  assert.match(service, /uploadTextDocument[\s\S]+requireAIBaseUrl\(\)/);
  assert.match(service, /uploadFileDocument[\s\S]+requireAIBaseUrl\(\)/);
  assert.match(service, /fetchDocuments[\s\S]+requireAIBaseUrl\(\)/);
});
