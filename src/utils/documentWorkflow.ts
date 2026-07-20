import { removeVietnameseTones } from './stringUtils.ts';

const normalizeDocumentText = (value: unknown) => removeVietnameseTones(String(value ?? '').trim().toLowerCase());

export const isArchivedDocumentStatus = (status: unknown) => (
  normalizeDocumentText(status) === 'da gia han'
);

export const isRegistrationDocumentType = (docType: unknown) => {
  const normalized = normalizeDocumentText(docType);
  return normalized.includes('dang kiem') || normalized.includes('kiem dinh');
};
