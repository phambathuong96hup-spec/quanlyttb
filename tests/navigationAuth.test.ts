import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('sidebar privacy flags match protected dashboard and device routes', () => {
  const appSource = readFileSync('src/App.tsx', 'utf8');
  const sidebarSource = readFileSync('src/components/layout/Sidebar.tsx', 'utf8');

  assert.match(appSource, /path="dashboard"\s+element=\{<PrivateRoute><Dashboard \/><\/PrivateRoute>\}/);
  assert.match(appSource, /path="devices"\s+element=\{<PrivateRoute><Devices \/><\/PrivateRoute>\}/);
  assert.match(sidebarSource, /\{ path: '\/dashboard', name: 'Tổng quan', icon: Activity, private: true \}/);
  assert.match(sidebarSource, /\{ path: '\/devices', name: 'Quản lý thiết bị', icon: Microscope, private: true \}/);
});
