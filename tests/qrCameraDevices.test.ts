import assert from 'node:assert/strict';
import test from 'node:test';
import { listGrantedCameras } from '../src/components/qr/cameraDevices.ts';

test('listing cameras after permission never opens another stream', async () => {
  let opened = 0;
  const media = {
    getUserMedia: async () => { opened++; throw new Error('Second stream interrupts camera'); },
    enumerateDevices: async () => [
      { kind: 'videoinput', deviceId: 'rear', label: 'Rear' },
      { kind: 'audioinput', deviceId: 'mic', label: 'Microphone' },
      { kind: 'videoinput', deviceId: 'front', label: 'Front' },
    ],
  };
  assert.deepEqual(await listGrantedCameras(media), [
    { id: 'rear', label: 'Rear' }, { id: 'front', label: 'Front' },
  ]);
  assert.equal(opened, 0);
});
