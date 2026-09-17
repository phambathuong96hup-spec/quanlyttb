import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { build } from 'vite';
import { parseVietnameseDate, parseFlexibleDate, daysUntil } from '../src/utils/dateUtils.ts';
import { safeFetch, postAction, reportRepair } from '../src/services/api.ts';
import { writeAuthSession } from '../src/authSession.ts';

class StorageMock {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const originalFetch = globalThis.fetch;
const originalWindow = globalThis.window;
beforeEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new StorageMock() });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new StorageMock() });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  writeAuthSession({ username: 'reviewer', token: 'test-token', role: 'Admin' });
});
afterEach(() => {
  globalThis.fetch = originalFetch;
  Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
});

test('strict date parsers reject suffixes, rollover and invalid times but accept valid ISO offsets', () => {
  for (const value of ['1x/01/2026', '01/01/2026junk', '31/02/2026', '29/02/2025']) {
    assert.equal(parseVietnameseDate(value), null, value);
  }
  for (const value of ['2026-02-31', '2026-01-01T24:00:00Z', '2026-01-01T12:60:00Z', '01/01/2026 12:01:60']) {
    assert.equal(parseFlexibleDate(value), null, value);
  }
  assert.equal(parseFlexibleDate('2026-01-01T00:30:00+14:00')?.toISOString(), '2025-12-31T10:30:00.000Z');
  assert.ok(parseFlexibleDate('29/02/2024'));
  assert.equal(daysUntil(new Date(2026, 8, 14), new Date(2026, 8, 14)), 0);
  assert.equal(daysUntil(new Date(2026, 8, 15), new Date(2026, 8, 14)), 1);
});

test('build graph excludes internal snapshot even with opt-in and a custom build mode', async () => {
  const previous = process.env.VITE_ENABLE_INTERNAL_SNAPSHOT;
  process.env.VITE_ENABLE_INTERNAL_SNAPSHOT = 'true';
  try {
    const result = await build({ mode: 'review-production', logLevel: 'silent', build: { write: false } });
    const outputs = Array.isArray(result) ? result : [result];
    let moduleCount = 0;
    for (const output of outputs) {
      assert.ok('output' in output);
      for (const item of output.output) {
        if (item.type !== 'chunk') continue;
        for (const id of Object.keys(item.modules)) {
          moduleCount++;
          assert.doesNotMatch(id, /devices\.snapshot\.json/, 'internal snapshot must never enter a publishable build');
        }
      }
    }
    assert.ok(moduleCount > 0, 'must inspect a real build, not an empty result');
  } finally {
    if (previous === undefined) delete process.env.VITE_ENABLE_INTERNAL_SNAPSHOT;
    else process.env.VITE_ENABLE_INTERNAL_SNAPSHOT = previous;
  }
});

test('timeout while reading response body is classified as TIMEOUT', async () => {
  globalThis.fetch = async (_url, init) => ({
    ok: true,
    text: () => new Promise<string>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted body', 'AbortError')), { once: true });
    }),
  }) as Response;
  await assert.rejects(safeFetch('https://example.test', { timeoutMs: 10 }), { code: 'TIMEOUT' });
});

test('already aborted external signal prevents request and is not a timeout', async () => {
  const controller = new AbortController(); controller.abort();
  let called = false;
  globalThis.fetch = async () => { called = true; return new Response('{}'); };
  await assert.rejects(safeFetch('https://example.test', { signal: controller.signal }), { name: 'AbortError' });
  assert.equal(called, false);
});

test('GAS session failure envelope keeps SESSION_EXPIRED classification', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ success: false, message: 'Phiên đăng nhập đã hết hạn.' }));
  await assert.rejects(safeFetch('https://example.test'), { code: 'SESSION_EXPIRED' });
});

test('mutation retry preserves request ID after lost response and distinguishes a new successful operation', async () => {
  const ids: string[] = [];
  globalThis.fetch = async (_url, init) => {
    ids.push(JSON.parse(String(init?.body)).payload.requestId);
    if (ids.length === 1) throw new TypeError('network lost');
    return new Response(JSON.stringify({ success: true }));
  };
  const payload = { serial: 'TEST-001', docType: 'Đăng kiểm' };
  const unknown = await postAction('addDocument', payload);
  assert.equal(unknown.resultUnknown, true);
  assert.match(unknown.message, /chưa xác định/i);
  await postAction('addDocument', payload);
  await postAction('addDocument', payload);
  assert.ok(ids[0]); assert.equal(ids[0], ids[1]); assert.notEqual(ids[1], ids[2]);
});

test('single legacy image upload gets upload timeout rather than read timeout', async () => {
  const originalSetTimeout = globalThis.setTimeout;
  const delays: number[] = [];
  globalThis.setTimeout = ((fn: (...args: unknown[]) => void, delay?: number) => {
    delays.push(Number(delay)); return originalSetTimeout(fn, delay);
  }) as typeof setTimeout;
  try {
    globalThis.fetch = async () => new Response('{"success":true}');
    await reportRepair({ deviceId: 'TEST', description: 'test', userName: 'test', userEmail: '', imageContent: 'base64', imageName: 'test.jpg' });
    assert.ok(delays.some(delay => delay >= 60000));
  } finally { globalThis.setTimeout = originalSetTimeout; }
});
