export const MAX_REPAIR_ATTACHMENTS = 8;
export const REPAIR_ATTACHMENT_ACCEPT = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'video/quicktime',
  'video/webm',
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.mp4',
  '.mov',
  '.webm',
].join(',');

export interface AttachmentLimits {
  accept: string;
  maxFiles: number;
  maxSizeMB: number;
  maxTotalSizeMB: number;
}

export interface AttachmentSelectionResult {
  files: File[];
  errors: string[];
}

export interface RepairAttachmentPayload {
  name: string;
  mimeType: string;
  size: number;
  content: string;
}

export const DEFAULT_REPAIR_ATTACHMENT_LIMITS: AttachmentLimits = {
  accept: REPAIR_ATTACHMENT_ACCEPT,
  maxFiles: MAX_REPAIR_ATTACHMENTS,
  maxSizeMB: 12,
  maxTotalSizeMB: 16,
};

const BYTES_PER_MB = 1024 * 1024;

const MIME_TYPE_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
};

const fileExtension = (fileName: string) => {
  const dotIndex = fileName.lastIndexOf('.');
  return dotIndex >= 0 ? fileName.slice(dotIndex).toLowerCase() : '';
};

const acceptedTokens = (accept: string) => new Set(
  accept
    .split(',')
    .map(token => token.trim().toLowerCase())
    .filter(Boolean)
);

export const getAttachmentMimeType = (file: File) => (
  MIME_TYPE_BY_EXTENSION[fileExtension(file.name)] || file.type || 'application/octet-stream'
);

export const attachmentKey = (file: File) => (
  `${file.name.toLowerCase()}::${file.size}::${file.lastModified}`
);

export const isAcceptedAttachment = (file: File, accept = REPAIR_ATTACHMENT_ACCEPT) => {
  const tokens = acceptedTokens(accept);
  const mimeType = String(file.type || '').toLowerCase();
  const extension = fileExtension(file.name);
  const expectedMimeType = MIME_TYPE_BY_EXTENSION[extension] || '';
  const hasExtensionRules = Array.from(tokens).some(token => token.startsWith('.'));
  const extensionAccepted = Boolean(extension && tokens.has(extension));
  const mimeAccepted = Boolean(mimeType && (
    tokens.has(mimeType) || tokens.has(`${mimeType.split('/')[0]}/*`)
  ));

  if (hasExtensionRules && !extensionAccepted) return false;
  if (expectedMimeType && mimeType && mimeType !== expectedMimeType) return false;
  return extensionAccepted || mimeAccepted;
};

export const getTotalAttachmentSize = (files: File[]) => (
  files.reduce((total, file) => total + file.size, 0)
);

export const formatAttachmentSize = (size: number) => {
  if (size < BYTES_PER_MB) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / BYTES_PER_MB).toFixed(1)} MB`;
};

export const mergeAttachmentSelection = (
  currentFiles: File[],
  incomingFiles: File[],
  limits: AttachmentLimits = DEFAULT_REPAIR_ATTACHMENT_LIMITS
): AttachmentSelectionResult => {
  const files = [...currentFiles];
  const errors: string[] = [];
  const knownFiles = new Set(files.map(attachmentKey));
  let totalSize = getTotalAttachmentSize(files);
  const maxFileSize = limits.maxSizeMB * BYTES_PER_MB;
  const maxTotalSize = limits.maxTotalSizeMB * BYTES_PER_MB;

  for (const file of incomingFiles) {
    const key = attachmentKey(file);
    if (knownFiles.has(key)) {
      errors.push(`${file.name} đã được chọn.`);
      continue;
    }
    if (!isAcceptedAttachment(file, limits.accept)) {
      errors.push(`${file.name}: định dạng tệp chưa được hỗ trợ.`);
      continue;
    }
    if (file.size > maxFileSize) {
      errors.push(`${file.name}: vượt quá ${limits.maxSizeMB} MB.`);
      continue;
    }
    if (files.length >= limits.maxFiles) {
      errors.push(`Chỉ được chọn tối đa ${limits.maxFiles} tệp.`);
      continue;
    }
    if (totalSize + file.size > maxTotalSize) {
      errors.push(`${file.name}: tổng dung lượng không được vượt quá ${limits.maxTotalSizeMB} MB.`);
      continue;
    }

    files.push(file);
    knownFiles.add(key);
    totalSize += file.size;
  }

  return { files, errors };
};

export const readFileAsBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => {
    const result = typeof reader.result === 'string' ? reader.result : '';
    const commaIndex = result.indexOf(',');
    if (commaIndex < 0) {
      reject(new Error(`Không đọc được ${file.name}.`));
      return;
    }
    resolve(result.slice(commaIndex + 1));
  };
  reader.onerror = () => reject(reader.error || new Error(`Không đọc được ${file.name}.`));
  reader.readAsDataURL(file);
});

export const buildAttachmentPayloads = (
  files: File[],
  readContent: (file: File) => Promise<string> = readFileAsBase64
): Promise<RepairAttachmentPayload[]> => Promise.all(files.map(async file => ({
  name: file.name,
  mimeType: getAttachmentMimeType(file),
  size: file.size,
  content: await readContent(file),
})));
