import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractEvidenceLinks, isVideoEvidenceLabel, stripEvidenceLinks } from '../src/utils/evidenceUtils.ts';

test('evidence utilities extract image links and leave readable notes', () => {
  const text = [
    'Máy báo lỗi nguồn',
    '[Ảnh minh chứng]: https://drive.google.com/file/d/abc/view',
    '[Video minh chứng 2 - may-rung.mp4]: https://drive.google.com/file/d/video/view',
    '[Ảnh hoàn thành/xử lý]: https://example.com/finish.png',
  ].join('\n');

  assert.deepEqual(extractEvidenceLinks(text), [
    {
      label: 'Ảnh minh chứng',
      url: 'https://drive.google.com/file/d/abc/view',
    },
    {
      label: 'Video minh chứng 2 - may-rung.mp4',
      url: 'https://drive.google.com/file/d/video/view',
    },
    {
      label: 'Ảnh hoàn thành/xử lý',
      url: 'https://example.com/finish.png',
    },
  ]);
  assert.equal(stripEvidenceLinks(text), 'Máy báo lỗi nguồn');
  assert.equal(isVideoEvidenceLabel('Video minh chứng 2 - van-hanh.mp4'), true);
  assert.equal(isVideoEvidenceLabel('Ảnh minh chứng 1 - video-may.jpg'), false);
});
