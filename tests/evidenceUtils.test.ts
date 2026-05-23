import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractEvidenceLinks, stripEvidenceLinks } from '../src/utils/evidenceUtils.ts';

test('evidence utilities extract image links and leave readable notes', () => {
  const text = [
    'Máy báo lỗi nguồn',
    '[Ảnh minh chứng]: https://drive.google.com/file/d/abc/view',
    '[Ảnh hoàn thành/xử lý]: https://example.com/finish.png',
  ].join('\n');

  assert.deepEqual(extractEvidenceLinks(text), [
    {
      label: 'Ảnh minh chứng',
      url: 'https://drive.google.com/file/d/abc/view',
    },
    {
      label: 'Ảnh hoàn thành/xử lý',
      url: 'https://example.com/finish.png',
    },
  ]);
  assert.equal(stripEvidenceLinks(text), 'Máy báo lỗi nguồn');
});
