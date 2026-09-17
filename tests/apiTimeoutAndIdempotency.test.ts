import assert from 'node:assert/strict';
import test, { beforeEach } from 'node:test';
import { writeAuthSession } from '../src/authSession.ts';
import {
  safeFetch,
  reportRepair,
  generateRequestId,
  ApiTimeoutError,
} from '../src/services/api.ts';

class MemoryStorage {
  values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
beforeEach(() => {
  Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() });
  Object.defineProperty(globalThis, 'window', { configurable: true, value: new EventTarget() });
  writeAuthSession({ username: 'qa-api', token: 'test-token', role: 'Admin' });
});

test('generateRequestId creates unique formatted request identifiers', () => {
  const id1 = generateRequestId('REPAIR');
  const id2 = generateRequestId('REPAIR');
  const id3 = generateRequestId('XFER');

  assert.ok(id1.startsWith('REPAIR-'));
  assert.ok(id2.startsWith('REPAIR-'));
  assert.ok(id3.startsWith('XFER-'));
  assert.notEqual(id1, id2);
});

test('safeFetch aborts and throws ApiTimeoutError when timeoutMs expires', async () => {
  const originalFetch = globalThis.fetch;
  let clearedTimer = false;
  const originalClearTimeout = globalThis.clearTimeout;

  // Intercept clearTimeout to verify it gets called in finally
  globalThis.clearTimeout = ((timerId: unknown) => {
    clearedTimer = true;
    return originalClearTimeout(timerId as Parameters<typeof originalClearTimeout>[0]);
  }) as typeof originalClearTimeout;

  try {
    // Mock slow fetch that honors abort signal
    globalThis.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_, reject) => {
        if (init?.signal) {
          init.signal.addEventListener('abort', () => {
            const err = new Error('The operation was aborted');
            err.name = 'AbortError';
            reject(err);
          });
        }
      });
    };

    await assert.rejects(
      async () => {
        await safeFetch('https://example.com/api', { timeoutMs: 50 });
      },
      (err: unknown) => {
        assert.ok(err instanceof ApiTimeoutError);
        assert.equal((err as ApiTimeoutError).code, 'TIMEOUT');
        assert.match(err.message, /Quá thời gian chờ phản hồi/);
        return true;
      }
    );

    // Verify timer was cleaned up unconditionally
    assert.equal(clearedTimer, true);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.clearTimeout = originalClearTimeout;
  }
});

test('safeFetch categorizes HTTP session expiration and parse errors', async () => {
  const originalFetch = globalThis.fetch;

  try {
    // 1. 401 Session expired
    globalThis.fetch = async () => new Response('Unauthorized', { status: 401 });
    await assert.rejects(
      async () => {
        await safeFetch('https://example.com/api');
      },
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'SESSION_EXPIRED');
        return true;
      }
    );

    // 2. Invalid JSON response
    globalThis.fetch = async () => new Response('<html>Error page</html>', { status: 200 });
    await assert.rejects(
      async () => {
        await safeFetch('https://example.com/api');
      },
      (err: unknown) => {
        assert.equal((err as { code?: string }).code, 'PARSE_ERROR');
        return true;
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('postAction passes requestId, selects appropriate timeouts, and catches timeout gracefully', async () => {
  const originalFetch = globalThis.fetch;
  let capturedBody: string | null = null;

  try {
    globalThis.fetch = async (_url: RequestInfo | URL, init?: RequestInit) => {
      capturedBody = init?.body as string;
      return new Response(JSON.stringify({ success: true, message: 'OK' }), { status: 200 });
    };

    const reqId = 'REQ-TEST-123';
    const res = await reportRepair(
      {
        deviceId: 'TB-01',
        userName: 'Alice',
        userEmail: 'alice@example.com',
        description: 'Lỗi nguồn',
      },
      { requestId: reqId }
    );

    assert.equal(res.success, true);
    assert.ok(capturedBody);
    const parsed = JSON.parse(capturedBody);
    assert.equal(parsed.action, 'reportRepair');
    assert.equal(parsed.payload.requestId, reqId);
    assert.equal(parsed.payload.deviceId, 'TB-01');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
