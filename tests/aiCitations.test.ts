import assert from 'node:assert/strict';
import test from 'node:test';
import { formatReferencesForDisplay, normalizeCitationReference } from '../src/services/aiCitations.ts';

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

test('AI citations prioritize the requested regulation, direct overlap, and cap noisy sources', () => {
  const formatted = formatReferencesForDisplay([
    {
      reference_id: 'tt-19-noise',
      file_path: '19_2021_TT-BYT_495904.docx',
      document_title: 'Thông tư 19/2021/TT-BYT',
      section_title: 'Mục tiêu',
      content: ['Hồ sơ nghiên cứu phải cho phép xác định người tham gia.'],
    },
    {
      reference_id: 'nd-98-import',
      file_path: '98_2021_ND-CP_493940.docx',
      document_title: 'Nghị định 98/2021/NĐ-CP',
      section_title: 'Điều 48. Giấy phép nhập khẩu',
      content: ['Trình tự cấp phép nhập khẩu trang thiết bị y tế.'],
    },
    {
      reference_id: 'nd-98-principles',
      file_path: '98_2021_ND-CP_493940.docx',
      document_title: 'Nghị định 98/2021/NĐ-CP',
      section_title: 'Điều 3. Nguyên tắc quản lý trang thiết bị y tế',
      content: ['Bảo đảm chất lượng, an toàn và sử dụng hiệu quả trang thiết bị y tế.'],
    },
    {
      reference_id: 'nd-98-incident',
      file_path: '98_2021_ND-CP_493940.docx',
      document_title: 'Nghị định 98/2021/NĐ-CP',
      section_title: 'Điều 35. Xử lý sự cố',
      content: ['Xử lý trang thiết bị y tế đã xảy ra sự cố.'],
    },
    {
      reference_id: 'nd-98-transition',
      file_path: '98_2021_ND-CP_493940.docx',
      document_title: 'Nghị định 98/2021/NĐ-CP',
      section_title: 'Điều 76. Điều khoản chuyển tiếp',
      content: ['Quy định chuyển tiếp về hồ sơ đăng ký lưu hành.'],
    },
  ], 'Theo Nghị định 98/2021/NĐ-CP, nguyên tắc quản lý trang thiết bị y tế là gì?');

  assert.match(formatted, /1\. Nghị định 98\/2021\/NĐ-CP/);
  assert.match(formatted, /Mục\/phần: Điều 3\. Nguyên tắc quản lý trang thiết bị y tế/);
  assert.doesNotMatch(formatted, /Thông tư 19|tt-19-noise/);
  assert.equal((formatted.match(/^\d+\. /gm) || []).length, 3);
});

test('normalizeCitationReference maps both snake_case and camelCase citations correctly', () => {
  // Backend snake_case
  const snakeCase = normalizeCitationReference({
    reference_id: 'ref-1',
    document_title: 'Nghị định 98/2021/NĐ-CP',
    section_title: 'Điều 10',
    file_path: '/docs/nd98.docx',
    content: ['Nội dung điều 10'],
  });
  assert.equal(snakeCase.referenceId, 'ref-1');
  assert.equal(snakeCase.documentTitle, 'Nghị định 98/2021/NĐ-CP');
  assert.equal(snakeCase.sectionTitle, 'Điều 10');
  assert.equal(snakeCase.fileName, '/docs/nd98.docx');
  assert.equal(snakeCase.excerpt, 'Nội dung điều 10');

  // Local camelCase
  const camelCase = normalizeCitationReference({
    referenceId: 'local-1',
    documentTitle: 'Thông tư 05/2022/TT-BYT',
    sectionTitle: 'Điều 4',
    fileName: 'tt05.json',
    excerpt: 'Quy định phân loại thiết bị',
  });
  assert.equal(camelCase.documentTitle, 'Thông tư 05/2022/TT-BYT');
  assert.equal(camelCase.sectionTitle, 'Điều 4');
  assert.equal(camelCase.fileName, 'tt05.json');
  assert.equal(camelCase.excerpt, 'Quy định phân loại thiết bị');

  // Missing title fallbacks to file basename
  const fallback = normalizeCitationReference({
    file_path: '/path/to/tai-lieu-kiem-dinh.pdf',
  }, 0);
  assert.equal(fallback.documentTitle, 'tai-lieu-kiem-dinh.pdf');
});
