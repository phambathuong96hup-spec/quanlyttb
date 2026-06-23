import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReferencesForDisplay } from '../src/services/aiCitations.ts';

test('AI citations show numbered source details with file, reference id, and excerpt', () => {
  const formatted = formatReferencesForDisplay([
    {
      reference_id: 'chunk-05-2022-12',
      file_path: '/legal/05_2022_TT-BYT_499978.docx',
      content: ['Điều 7 quy định hồ sơ quản lý trang thiết bị y tế phải được lưu trữ đầy đủ.'],
    },
  ]);

  assert.match(formatted, /Nguồn trích dẫn:/);
  assert.match(formatted, /1\. 05_2022_TT-BYT_499978\.docx/);
  assert.match(formatted, /Mã tham chiếu: chunk-05-2022-12/);
  assert.match(formatted, /Tệp: \/legal\/05_2022_TT-BYT_499978\.docx/);
  assert.match(formatted, /Trích đoạn: Điều 7 quy định hồ sơ quản lý/);
});

test('AI citations include local legal RAG document and section metadata', () => {
  const formatted = formatReferencesForDisplay([
    {
      documentTitle: 'Thông tư 05/2022/TT-BYT',
      fileName: '05_2022_TT-BYT_499978.docx',
      sectionTitle: 'Điều 8',
      excerpt: 'Cơ sở y tế phân công người chịu trách nhiệm theo dõi hồ sơ thiết bị.',
    },
  ]);

  assert.match(formatted, /1\. Thông tư 05\/2022\/TT-BYT/);
  assert.match(formatted, /Tệp: 05_2022_TT-BYT_499978\.docx/);
  assert.match(formatted, /Mục\/phần: Điều 8/);
  assert.match(formatted, /Trích đoạn: Cơ sở y tế phân công/);
});
