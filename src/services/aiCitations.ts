export interface AiCitationReference {
  reference_id?: string;
  file_path?: string;
  content?: string[];
  documentTitle?: string;
  fileName?: string;
  sectionTitle?: string;
  excerpt?: string;
}

const basename = (path: string) => path.split(/[\\/]/).filter(Boolean).pop() || path;

const cleanLine = (value: string) => value.replace(/\s+/g, ' ').trim();

const truncate = (value: string, maxLength = 260) => {
  const cleaned = cleanLine(value);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength - 3).trim()}...`;
};

const citationKey = (reference: AiCitationReference) => [
  reference.reference_id || '',
  reference.file_path || '',
  reference.fileName || '',
  reference.sectionTitle || '',
].join('|');

const citationTitle = (reference: AiCitationReference, index: number) => {
  if (reference.documentTitle) return reference.documentTitle;
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

export const formatReferencesForDisplay = (references: AiCitationReference[]) => {
  const uniqueReferences = references.filter((reference, index, all) => {
    const key = citationKey(reference);
    return key.trim() && all.findIndex(item => citationKey(item) === key) === index;
  });

  if (!uniqueReferences.length) return '';

  return [
    '',
    '',
    'Nguồn trích dẫn:',
    ...uniqueReferences.map((reference, index) => {
      const lines = [`${index + 1}. ${citationTitle(reference, index)}`];
      const file = citationFile(reference);
      const excerpt = citationExcerpt(reference);

      if (reference.reference_id) lines.push(`   - Mã tham chiếu: ${reference.reference_id}`);
      if (file) lines.push(`   - Tệp: ${file}`);
      if (reference.sectionTitle) lines.push(`   - Mục/phần: ${reference.sectionTitle}`);
      if (excerpt) lines.push(`   - Trích đoạn: ${truncate(excerpt)}`);

      return lines.join('\n');
    }),
  ].join('\n');
};
