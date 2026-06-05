import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

test('HIS realtime modules are temporarily hidden from app navigation and tracking', () => {
  const appSource = readFileSync('src/App.tsx', 'utf8');
  const sidebarSource = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');
  const source = readFileSync('src/pages/TrackDevices.tsx', 'utf8');
  const transfersSource = readFileSync('src/pages/Transfers.tsx', 'utf8');

  assert.doesNotMatch(appSource, /path="his-devices"/);
  assert.doesNotMatch(sidebarSource, /Thiết bị HIS/);
  assert.doesNotMatch(source, /HisDevices/);
  assert.doesNotMatch(source, /Theo dõi HIS trực tiếp/);
  assert.doesNotMatch(transfersSource, /fetchHisCategories/);
  assert.doesNotMatch(transfersSource, /theo HIS/i);
});
