import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mammoth from 'mammoth';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');
const outputDir = path.join(projectRoot, 'public', 'rag');
const outputFile = path.join(outputDir, 'legal-knowledge.json');

const sourceDir = process.env.DOCX_SOURCE_DIR
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Downloads');

const documents = [
  {
    id: 'tt-05-2022-byt',
    fileName: '05_2022_TT-BYT_499978.docx',
    title: 'Thông tư 05/2022/TT-BYT',
    description: 'Quy định chi tiết thi hành một số điều của Nghị định 98/2021/NĐ-CP về quản lý trang thiết bị y tế.',
  },
  {
    id: 'tt-19-2021-byt',
    fileName: '19_2021_TT-BYT_495904.docx',
    title: 'Thông tư 19/2021/TT-BYT',
    description: 'Quy định mẫu văn bản, báo cáo thực hiện Nghị định 98/2021/NĐ-CP về quản lý trang thiết bị y tế.',
  },
  {
    id: 'nd-98-2021-cp',
    fileName: '98_2021_ND-CP_493940.docx',
    title: 'Nghị định 98/2021/NĐ-CP',
    description: 'Quy định về quản lý trang thiết bị y tế.',
  },
  {
    id: 'nd-117-2020-cp',
    fileName: '117_2020_ND-CP_398159.docx',
    title: 'Nghị định 117/2020/NĐ-CP',
    description: 'Quy định xử phạt vi phạm hành chính trong lĩnh vực y tế.',
  },
  {
    id: 'qd-7115-byt',
    fileName: '7115_QD-BYT_332675.docx',
    title: 'Quyết định 7115/QĐ-BYT',
    description: 'Ban hành quy trình thanh tra trang thiết bị y tế.',
  },
];

const MAX_CHARS = 1800;
const OVERLAP_CHARS = 260;

const cleanText = (value) => String(value || '')
  .replace(/\u00a0/g, ' ')
  .replace(/[ \t]+/g, ' ')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

const estimateTokens = (value) => Math.max(1, Math.ceil(cleanText(value).length / 4));

const isSectionHeading = (paragraph) => {
  const text = paragraph.trim();
  return /^(Chương|Mục|Điều|Phụ lục|THÔNG TƯ|NGHỊ ĐỊNH|QUYẾT ĐỊNH)\b/i.test(text)
    || /^[IVXLCDM]+\.\s+[A-ZĐ]/.test(text);
};

const splitLongParagraph = (paragraph) => {
  if (paragraph.length <= MAX_CHARS) return [paragraph];
  const sentences = paragraph.split(/(?<=[.!?;:])\s+/);
  const parts = [];
  let current = '';

  for (const sentence of sentences) {
    if ((current + ' ' + sentence).trim().length > MAX_CHARS && current) {
      parts.push(current.trim());
      current = sentence;
    } else {
      current = `${current} ${sentence}`.trim();
    }
  }

  if (current) parts.push(current.trim());
  return parts;
};

const makeOverlap = (paragraphs) => {
  const overlap = [];
  let size = 0;
  for (let index = paragraphs.length - 1; index >= 0; index -= 1) {
    const paragraph = paragraphs[index];
    if (size + paragraph.length > OVERLAP_CHARS && overlap.length > 0) break;
    overlap.unshift(paragraph);
    size += paragraph.length;
  }
  return overlap;
};

const chunkDocument = (document, text) => {
  const paragraphs = cleanText(text)
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .flatMap(splitLongParagraph);

  const chunks = [];
  let current = [];
  let currentSection = document.title;

  const flush = () => {
    if (current.length === 0) return;
    const body = current.join('\n');
    chunks.push({
      id: `${document.id}-${String(chunks.length + 1).padStart(4, '0')}`,
      documentId: document.id,
      documentTitle: document.title,
      documentDescription: document.description,
      fileName: document.fileName,
      sectionTitle: currentSection,
      chunkIndex: chunks.length,
      text: body,
      tokenEstimate: estimateTokens(body),
    });
    current = makeOverlap(current);
  };

  for (const paragraph of paragraphs) {
    if (isSectionHeading(paragraph)) {
      if (current.length > 0 && current.join('\n').length > OVERLAP_CHARS) {
        flush();
        current = [];
      }
      currentSection = paragraph.slice(0, 160);
    }

    const nextSize = current.join('\n').length + paragraph.length + 1;
    if (nextSize > MAX_CHARS && current.length > 0) {
      flush();
    }
    current.push(paragraph);
  }

  flush();
  return chunks;
};

const readDocx = async (document) => {
  const filePath = path.join(sourceDir, document.fileName);
  const result = await mammoth.extractRawText({ path: filePath });
  const text = cleanText(result.value);
  if (!text) {
    throw new Error(`No text extracted from ${filePath}`);
  }
  return { ...document, sourcePath: filePath, charLength: text.length, text };
};

const main = async () => {
  const extracted = [];
  const chunks = [];

  for (const document of documents) {
    const extractedDoc = await readDocx(document);
    extracted.push({
      id: extractedDoc.id,
      title: extractedDoc.title,
      description: extractedDoc.description,
      fileName: extractedDoc.fileName,
      charLength: extractedDoc.charLength,
    });
    chunks.push(...chunkDocument(extractedDoc, extractedDoc.text));
  }

  const index = {
    version: 1,
    generatedAt: new Date().toISOString(),
    source: 'Bộ 5 văn bản pháp quy về quản lý trang thiết bị y tế',
    documents: extracted,
    chunks,
  };

  await mkdir(outputDir, { recursive: true });
  await writeFile(outputFile, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${chunks.length} chunks from ${extracted.length} documents to ${outputFile}`);
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
