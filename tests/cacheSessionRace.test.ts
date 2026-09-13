import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import ts from 'typescript';

test('a late response after logout cannot replace the next session cache', async () => {
  const effects: Array<() => void> = [];
  const react = {
    useState: (initial: unknown) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useCallback: (callback: unknown) => callback,
    useRef: (current: unknown) => ({ current }),
    useEffect: (effect: () => void) => effects.push(effect),
  };
  const source = readFileSync('src/hooks/useApiResource.ts', 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const exports = {} as {
    useApiResource: (key: string, fetcher: () => Promise<string[]>) => { data: string[] };
    clearApiResourceCache: () => void;
  };
  new Function('require', 'exports', output)(() => react, exports);
  let finishOld!: (data: string[]) => void;
  exports.useApiResource('devices', () => new Promise<string[]>(resolve => { finishOld = resolve; }));
  effects.splice(0).forEach(effect => effect());
  exports.clearApiResourceCache();
  exports.useApiResource('devices', async () => ['new-session']);
  effects.splice(0).forEach(effect => effect());
  await new Promise(resolve => setImmediate(resolve));
  finishOld(['old-session']);
  await new Promise(resolve => setImmediate(resolve));
  const current = exports.useApiResource('devices', async () => []);
  assert.deepEqual(current.data, ['new-session']);
});
