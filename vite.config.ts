import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath, URL } from 'node:url';

// https://vite.dev/config/
export default defineConfig(({ command }) => {
  // Production builds NEVER include the internal snapshot under any circumstance.
  // Internal snapshot is only permitted in development/offline mode when explicitly enabled.
  const allowInternalSnapshot = command === 'serve' && process.env.VITE_ENABLE_INTERNAL_SNAPSHOT === 'true';
  const demoDevicesPath = fileURLToPath(new URL('./src/data/demoDevices.json', import.meta.url));

  return {
    plugins: [
      {
        name: 'snapshot-decoupler',
        enforce: 'pre',
        resolveId(source) {
          if (!allowInternalSnapshot && (source.endsWith('devices.snapshot.json') || source.includes('devices.snapshot.json'))) {
            return demoDevicesPath;
          }
          return null;
        },
      },
      react(),
    ],
    base: process.env.VITE_BASE_PATH || '/',
  };
});
