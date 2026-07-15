export interface AiCitationReference {
  reference_id?: string;
  file_path?: string;
  content?: string[];
  document_title?: string;
  section_title?: string;
  score?: number;
  documentTitle?: string;
  fileName?: string;
  sectionTitle?: string;
  excerpt?: string;
}

interface DocumentHint {
  aliases: string[];
}

const DOCUMENT_HINTS: DocumentHint[] = [
  { aliases: ['nghi dinh 98', '98/2021', '98 2021', 'nd 98', 'nd-cp 98'] },
  { aliases: ['nghi dinh 117', '117/2020', '117 2020', 'nd 117', 'nd-cp 117'] },
  { aliases: ['thong tu 05', '05/2022', '05 2022', 'tt 05', 'tt-byt 05'] },
  { aliases: ['thong tu 19', '19/2021', '19 2021', 'tt 19', 'tt-byt 19'] },
  { aliases: ['quyet dinh 7115', '7115/qd', '7115 qd', 'qd 7115'] },
];

const STOPWORDS = new Set([
  'ai', 'cac', 'can', 'cho', 'co', 'cua', 'duoc', 'gi', 'khi', 'khong',
  'la', 'mot', 'nao', 'nhu', 'o', 'phai', 'ra', 'so', 'tai', 'te', 'the', 'theo',
  'thi', 'trong', 'tu', 'va', 've', 'voi',
]);

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

const cleanLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const normalizeForMatch = (value: string) => value
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .replace(/Đ/g, 'D')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const tokenize = (value: string) => normalizeForMatch(value)
  .split(' ')
  .filter(token => token.length > 1);

const truncate = (value: string, maxLength = 260) => {
  const cleaned = cleanLine(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3).trim()}...`;
};

const citationKey = (reference: AiCitationReference) => [
  reference.reference_id || '',
  reference.file_path || '',
  reference.fileName || '',
  reference.sectionTitle || reference.section_title || '',
].join('|');

const citationTitle = (reference: AiCitationReference, index: number) => {
  if (reference.documentTitle || reference.document_title) {
    return reference.documentTitle || reference.document_title;
  }
  if (reference.fileName) return reference.fileName;
  if (reference.file_path) return basename(reference.file_path);
  return `Nguồn ${index + 1}`;
};

const citationFile = (reference: AiCitationReference) => (
  reference.file_path || reference.fileName || ''
);

const citationExcerpt = (reference: AiCitationReference) => (
  reference.excerpt || reference.content?.find(Boolean) || ''
);

const citationSection = (reference: AiCitationReference) => (
  reference.sectionTitle || reference.section_title || ''
);

const findDocumentHint = (query: string) => {
  const normalizedQuery = normalizeForMatch(query);
  return DOCUMENT_HINTS.find(hint => hint.aliases.some(alias => (
    normalizedQuery.includes(normalizeForMatch(alias))
  )));
};

const referenceMatchesHint = (
  reference: AiCitationReference,
  hint: DocumentHint,
) => {
  const searchable = normalizeForMatch([
    reference.documentTitle,
    reference.document_title,
    reference.fileName,
    reference.file_path,
    reference.reference_id,
  ].filter(Boolean).join(' '));
  return hint.aliases.some(alias => searchable.includes(normalizeForMatch(alias)));
};

const orderedOverlapRatio = (queryTokens: string[], text: string) => {
  if (!queryTokens.length) return 0;
  const normalizedText = normalizeForMatch(text);
  for (let size = queryTokens.length; size >= 2; size -= 1) {
    for (let start = 0; start <= queryTokens.length - size; start += 1) {
      if (normalizedText.includes(queryTokens.slice(start, start + size).join(' '))) {
        return size / queryTokens.length;
      }
    }
  }
  return 0;
};

const overlapRatio = (queryTokens: string[], text: string) => {
  if (!queryTokens.length) return 0;
  const textTokens = new Set(tokenize(text));
  const overlap = new Set(queryTokens.filter(token => textTokens.has(token))).size;
  return overlap / queryTokens.length;
};

const referenceRelevance = (
  reference: AiCitationReference,
  queryTokens: string[],
) => {
  const section = citationSection(reference);
  const evidence = [section, citationExcerpt(reference)].filter(Boolean).join(' ');
  return overlapRatio(queryTokens, evidence) * 2
    + orderedOverlapRatio(queryTokens, evidence) * 3
    + overlapRatio(queryTokens, section) * 2;
};

export const formatReferencesForDisplay = (
  references: AiCitationReference[],
  query = '',
  maxReferences = 3,
) => {
  const uniqueReferences = references.filter((reference, index, all) => {
    const key = citationKey(reference);
    return key.trim() && all.findIndex(item => citationKey(item) === key) === index;
  });

  if (!uniqueReferences.length) return '';

  const documentHint = findDocumentHint(query);
  const matchingReferences = documentHint
    ? uniqueReferences.filter(reference => referenceMatchesHint(reference, documentHint))
    : [];
  const candidates = matchingReferences.length ? matchingReferences : uniqueReferences;
  const documentTokens = new Set(documentHint?.aliases.flatMap(tokenize) || []);
  const queryTokens = Array.from(new Set(
    tokenize(query).filter(token => !STOPWORDS.has(token) && !documentTokens.has(token)),
  ));
  const ranked = candidates
    .map((reference, index) => ({
      reference,
      index,
      relevance: referenceRelevance(reference, queryTokens),
    }))
    .sort((left, right) => right.relevance - left.relevance || left.index - right.index);
  const bestRelevance = ranked[0]?.relevance || 0;
  const selectedReferences = ranked
    .filter(item => !bestRelevance || item.relevance >= bestRelevance * 0.25)
    .slice(0, Math.max(1, maxReferences))
    .map(item => item.reference);

  return [
    '',
    '',
    'Nguồn trích dẫn:',
    ...selectedReferences.map((reference, index) => {
      const lines = [`${index + 1}. ${citationTitle(reference, index)}`];
      const file = citationFile(reference);
      const excerpt = citationExcerpt(reference);

      if (reference.reference_id) lines.push(`   - Mã tham chiếu: ${reference.reference_id}`);
      if (file) lines.push(`   - Tệp: ${file}`);
      const section = citationSection(reference);
      if (section) lines.push(`   - Mục/phần: ${section}`);
      if (excerpt) lines.push(`   - Trích đoạn: ${truncate(excerpt)}`);

      return lines.join('\n');
    }),
  ].join('\n');
};
