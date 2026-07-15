import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

type PackageLock = {
  packages: Record<string, { version?: string }>;
};

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as PackageLock;

const versionParts = (version: string) => version.split('.').map(part => Number.parseInt(part, 10) || 0);

const isAtLeast = (actual: string, minimum: string) => {
  const left = versionParts(actual);
  const right = versionParts(minimum);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference > 0;
  }
  return true;
};

const installedVersion = (packageName: string) => {
  const version = lock.packages[`node_modules/${packageName}`]?.version;
  assert.ok(version, `${packageName} must be installed in package-lock.json`);
  return version;
};

test('security-sensitive frontend dependencies are outside known vulnerable ranges', () => {
  assert.ok(isAtLeast(installedVersion('react-router-dom'), '7.15.1'));
  assert.ok(isAtLeast(installedVersion('vite'), '8.0.16'));
  assert.ok(isAtLeast(installedVersion('dompurify'), '3.4.11'));
  assert.ok(isAtLeast(installedVersion('js-yaml'), '4.1.2'));
  assert.ok(isAtLeast(installedVersion('@babel/core'), '7.29.1'));
});
