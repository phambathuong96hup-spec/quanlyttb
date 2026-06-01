import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('tracking page exposes the HIS realtime monitor as the default tab', () => {
  const source = readFileSync('src/pages/TrackDevices.tsx', 'utf8');

  assert.match(source, /import HisDevices from '\.\/HisDevices'/);
  assert.match(source, /useState<'repairs' \| 'transfers' \| 'his'>\('his'\)/);
  assert.match(source, /Theo dõi HIS trực tiếp/);
  assert.match(source, /activeTab === 'his' && <HisDevices \/>/);
});
