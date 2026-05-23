export interface EvidenceLink {
  label: string;
  url: string;
}

const evidenceLinePattern = /^\s*\[([^\]]*Ảnh[^\]]*)\]\s*:\s*(https?:\/\/\S+)\s*$/i;

export const extractEvidenceLinks = (text: unknown): EvidenceLink[] => {
  return String(text ?? '')
    .split(/\r?\n/)
    .map(line => line.match(evidenceLinePattern))
    .filter((match): match is RegExpMatchArray => Boolean(match))
    .map(match => ({
      label: match[1].trim(),
      url: match[2].trim().replace(/[.,;]+$/g, ''),
    }));
};

export const stripEvidenceLinks = (text: unknown): string => {
  return String(text ?? '')
    .split(/\r?\n/)
    .filter(line => !evidenceLinePattern.test(line))
    .join('\n')
    .trim();
};
