import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const DEFAULT_ENDPOINT = 'https://script.google.com/macros/s/AKfycbwk_NI8tmQlxTcMLC0J6D8SN63sI7rEgj726h6GSTKqvYOTCtMhNb7gkqkkEOlZu-AU5g/exec';
const DEFAULT_USERNAME = 'pbthuong-kd';
const DEFAULT_PIN = '1';

const endpoint = process.argv[2] || process.env.VITE_THIET_BI_API_URL || DEFAULT_ENDPOINT;
const username = process.argv[3] || process.env.QLTTB_IMPORT_USERNAME || DEFAULT_USERNAME;
const pin = process.argv[4] || process.env.QLTTB_IMPORT_PIN || DEFAULT_PIN;
const dryRun = process.argv.includes('--dry-run');

const postAction = async (action, payload) => {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action, payload }),
  });
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Apps Script did not return JSON for ${action}: ${text.slice(0, 500)}`);
  }
};

const snapshotPath = resolve('src/data/devices.snapshot.json');
const devices = JSON.parse(await readFile(snapshotPath, 'utf8'));

console.log(`Importing ${devices.length} devices from ${snapshotPath}`);
if (dryRun) {
  const documents = devices.reduce((total, device) => total + (device.documents?.length || 0), 0);
  console.log(`Dry run only: ${devices.length} devices and ${documents} documents are ready to import.`);
  process.exit(0);
}

const login = await postAction('login', { username, pin });
if (!login.success || !login.token) {
  throw new Error(`Login failed: ${login.message || 'unknown error'}`);
}

const result = await postAction('importSnapshotDevices', {
  sessionToken: login.token,
  devices,
});

if (!result.success) {
  if (String(result.message || '').includes('Action không hợp lệ')) {
    throw new Error('Import action is not deployed yet. Deploy gas/Code.gs to Apps Script, then run this command again.');
  }
  throw new Error(`Import failed: ${result.message || JSON.stringify(result)}`);
}

console.log(`Imported ${result.devices} devices and ${result.documents} documents.`);
