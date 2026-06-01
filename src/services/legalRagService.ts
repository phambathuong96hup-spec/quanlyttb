import { removeVietnameseTones } from '../utils/stringUtils.ts';

interface LegalRagDocument {
  id: string;
  title: string;
  description: string;
  fileName: string;
  charLength: number;
}

interface LegalRagChunk {
  id: string;
  documentId: string;
  documentTitle: string;
  documentDescription: string;
  fileName: string;
  sectionTitle: string;
  chunkIndex: number;
  text: string;
  tokenEstimate: number;
}

interface LegalRagIndex {
  version: number;
  generatedAt: string;
  source: string;
  documents: LegalRagDocument[];
  chunks: LegalRagChunk[];
}

interface PreparedChunk extends LegalRagChunk {
  normalizedText: string;
  tokens: string[];
  termFrequency: Map<string, number>;
}

interface PreparedIndex extends LegalRagIndex {
  preparedChunks: PreparedChunk[];
  documentFrequency: Map<string, number>;
  averageChunkLength: number;
}

export interface LegalRagReference {
  documentTitle: string;
  fileName: string;
  sectionTitle: string;
  score: number;
  excerpt: string;
}

export interface LegalRagAnswer {
  response: string;
  references: LegalRagReference[];
}

const RAG_INDEX_URL = `${import.meta.env.BASE_URL}rag/legal-knowledge.json`;
const MIN_TOKEN_LENGTH = 2;
const BM25_K1 = 1.4;
const BM25_B = 0.72;

const DOCUMENT_ALIASES: Record<string, string[]> = {
  'tt-05-2022-byt': ['thong tu 05', '05/2022', '05 2022', 'tt 05', 'tt-byt 05'],
  'tt-19-2021-byt': ['thong tu 19', '19/2021', '19 2021', 'tt 19', 'tt-byt 19'],
  'nd-98-2021-cp': ['nghi dinh 98', '98/2021', '98 2021', 'nd 98', 'nd-cp 98'],
  'nd-117-2020-cp': ['nghi dinh 117', '117/2020', '117 2020', 'nd 117', 'nd-cp 117'],
  'qd-7115-byt': ['quyet dinh 7115', '7115/qd', '7115 qd', 'qd 7115'],
};

const STOPWORDS = new Set([
  'cua',
  'cac',
  'cho',
  'duoc',
  'theo',
  'trong',
  'ngoai',
  'nhung',
  'hoac',
  'va',
  'la',
  've',
  'voi',
  'mot',
  'nay',
  'tai',
  'khi',
  'thi',
  'tu',
  'den',
  'doi',
  'voi',
  'phai',
  'khong',
  'trang',
  'thiet',
  'bi',
  'te',
]);

let indexPromise: Promise<PreparedIndex> | null = null;

const normalize = (value: string) => removeVietnameseTones(value)
  .toLowerCase()
  .replace(/[^a-z0-9\s/-]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (value: string) => normalize(value)
  .split(/\s+/)
  .filter((token) => token.length >= MIN_TOKEN_LENGTH && !STOPWORDS.has(token));

const buildTermFrequency = (tokens: string[]) => {
  const frequency = new Map<string, number>();
  tokens.forEach((token) => {
    frequency.set(token, (frequency.get(token) || 0) + 1);
  });
  return frequency;
};

const prepareIndex = (index: LegalRagIndex): PreparedIndex => {
  const documentFrequency = new Map<string, number>();
  const preparedChunks = index.chunks.map((chunk) => {
    const normalizedText = normalize([
      chunk.documentTitle,
      chunk.documentDescription,
      chunk.sectionTitle,
      chunk.text,
    ].join('\n'));
    const tokens = tokenize(normalizedText);
    const termFrequency = buildTermFrequency(tokens);
    new Set(tokens).forEach((token) => {
      documentFrequency.set(token, (documentFrequency.get(token) || 0) + 1);
    });
    return { ...chunk, normalizedText, tokens, termFrequency };
  });

  const averageChunkLength = preparedChunks.length
    ? preparedChunks.reduce((sum, chunk) => sum + chunk.tokens.length, 0) / preparedChunks.length
    : 1;

  return {
    ...index,
    preparedChunks,
    documentFrequency,
    averageChunkLength,
  };
};

const loadIndex = async () => {
  if (!indexPromise) {
    indexPromise = fetch(RAG_INDEX_URL)
      .then((response) => {
        if (!response.ok) throw new Error(`Không tải được chỉ mục RAG (${response.status})`);
        return response.json() as Promise<LegalRagIndex>;
      })
      .then(prepareIndex);
  }
  return indexPromise;
};

const scoreBm25 = (chunk: PreparedChunk, queryTokens: string[], index: PreparedIndex) => {
  const totalChunks = index.preparedChunks.length || 1;
  return queryTokens.reduce((score, token) => {
    const tf = chunk.termFrequency.get(token) || 0;
    if (!tf) return score;

    const df = index.documentFrequency.get(token) || 0;
    const idf = Math.log(1 + (totalChunks - df + 0.5) / (df + 0.5));
    const lengthNorm = BM25_K1 * (1 - BM25_B + BM25_B * (chunk.tokens.length / index.averageChunkLength));
    return score + idf * ((tf * (BM25_K1 + 1)) / (tf + lengthNorm));
  }, 0);
};

const makeNgrams = (value: string) => {
  const compact = normalize(value).replace(/\s+/g, ' ');
  const grams = new Set<string>();
  for (let index = 0; index <= compact.length - 3; index += 1) {
    grams.add(compact.slice(index, index + 3));
  }
  return grams;
};

const ngramSimilarity = (queryGrams: Set<string>, text: string) => {
  const chunkGrams = makeNgrams(text.slice(0, 2500));
  if (!queryGrams.size || !chunkGrams.size) return 0;
  let overlap = 0;
  queryGrams.forEach((gram) => {
    if (chunkGrams.has(gram)) overlap += 1;
  });
  return overlap / Math.sqrt(queryGrams.size * chunkGrams.size);
};

const metadataBoost = (chunk: PreparedChunk, normalizedQuery: string, queryTokens: string[]) => {
  const metadata = normalize(`${chunk.documentTitle} ${chunk.documentDescription} ${chunk.sectionTitle}`);
  const directHit = metadata.includes(normalizedQuery) ? 1 : 0;
  const tokenHits = queryTokens.filter((token) => metadata.includes(token)).length;
  return directHit + tokenHits / Math.max(queryTokens.length, 1);
};

const documentAliasBoost = (chunk: PreparedChunk, normalizedQuery: string) => {
  const aliases = DOCUMENT_ALIASES[chunk.documentId] || [];
  return aliases.some((alias) => normalizedQuery.includes(normalize(alias))) ? 0.75 : 0;
};

const splitSentences = (text: string) => text
  .replace(/\s+/g, ' ')
  .split(/(?<=[.!?])\s+|\n+/)
  .map((sentence) => sentence.trim())
  .filter((sentence) => sentence.length > 40);

const excerptChunk = (chunk: PreparedChunk, queryTokens: string[]) => {
  const sentences = splitSentences(chunk.text);
  const scored = sentences
    .map((sentence, index) => {
      const normalizedSentence = normalize(sentence);
      const score = queryTokens.reduce((total, token) => (
        normalizedSentence.includes(token) ? total + 1 : total
      ), 0);
      return { sentence, index, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index)
    .map((item) => item.sentence);

  const excerpt = scored.length ? scored.join(' ') : chunk.text.slice(0, 420);
  return excerpt.length > 620 ? `${excerpt.slice(0, 617).trim()}...` : excerpt;
};

const buildResponse = (query: string, references: LegalRagReference[]) => {
  if (!references.length) {
    return [
      'Chưa tìm thấy đoạn phù hợp trong bộ 5 văn bản pháp quy đã nạp.',
      `Câu hỏi: ${query}`,
      'Bạn có thể hỏi cụ thể hơn theo số văn bản, điều khoản, xử phạt, kiểm định, phân loại hoặc hồ sơ quản lý trang thiết bị y tế.',
    ].join('\n\n');
  }

  const points = references.map((reference, index) => [
    `${index + 1}. ${reference.documentTitle} - ${reference.sectionTitle}`,
    reference.excerpt,
  ].join('\n'));

  const sources = references
    .map((reference) => `- ${reference.documentTitle} (${reference.fileName})`)
    .filter((item, index, all) => all.indexOf(item) === index);

  return [
    'Dựa trên bộ 5 văn bản pháp quy đã nạp, các đoạn liên quan nhất là:',
    points.join('\n\n'),
    'Nguồn tham khảo:',
    sources.join('\n'),
  ].join('\n\n');
};

export const queryLocalLegalRag = async (query: string): Promise<LegalRagAnswer> => {
  const index = await loadIndex();
  const queryTokens = tokenize(query);
  const normalizedQuery = normalize(query);
  const queryGrams = makeNgrams(query);

  if (!queryTokens.length) {
    return { response: buildResponse(query, []), references: [] };
  }

  const bm25Scores = index.preparedChunks.map((chunk) => ({
    chunk,
    bm25: scoreBm25(chunk, queryTokens, index),
  }));
  const maxBm25 = Math.max(...bm25Scores.map((item) => item.bm25), 0.0001);

  const ranked = bm25Scores
    .map(({ chunk, bm25 }) => {
      const normalizedBm25 = bm25 / maxBm25;
      const semanticScore = ngramSimilarity(queryGrams, chunk.normalizedText);
      const metaScore = metadataBoost(chunk, normalizedQuery, queryTokens);
      const score = normalizedBm25 * 0.68
        + semanticScore * 0.18
        + metaScore * 0.09
        + documentAliasBoost(chunk, normalizedQuery);
      return { chunk, score };
    })
    .filter((item) => item.score > 0.04)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const references = ranked.map(({ chunk, score }) => ({
    documentTitle: chunk.documentTitle,
    fileName: chunk.fileName,
    sectionTitle: chunk.sectionTitle,
    score,
    excerpt: excerptChunk(chunk, queryTokens),
  }));

  return {
    response: buildResponse(query, references),
    references,
  };
};

export const getLegalRagIndexSummary = async () => {
  const index = await loadIndex();
  return {
    documentCount: index.documents.length,
    chunkCount: index.chunks.length,
    generatedAt: index.generatedAt,
  };
};
