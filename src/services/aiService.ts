/**
 * AI Service — LightRAG API Client
 * Kết nối tới LightRAG server trên HuggingFace Spaces, có fallback RAG nội bộ.
 */

import { queryLocalLegalRag } from './legalRagService.ts';
import {
  formatReferencesForDisplay,
  normalizeCitationReference,
  type AiCitationReference,
  type NormalizedCitation,
} from './aiCitations.ts';

const viteEnv = import.meta.env ?? {};

export const normalizeAIBaseUrl = (
  value: unknown,
  allowInsecureLocalhost = false,
): string => {
  if (typeof value !== 'string' || !value.trim()) return '';

  try {
    const url = new URL(value.trim());
    const isLocalhost = url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '[::1]';
    const isAllowedProtocol = url.protocol === 'https:'
      || (allowInsecureLocalhost && isLocalhost && url.protocol === 'http:');

    if (!isAllowedProtocol || url.username || url.password) return '';

    url.hash = '';
    url.search = '';
    return url.toString().replace(/\/+$/, '');
  } catch {
    return '';
  }
};

const RAW_AI_BASE_URL = viteEnv.VITE_AI_API_URL || '';
const AI_BASE_URL = normalizeAIBaseUrl(RAW_AI_BASE_URL, Boolean(viteEnv.DEV));
const AI_API_KEY = viteEnv.VITE_AI_API_KEY || '';

// ==================== Types ====================

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface QueryRequest {
  query: string;
  mode?: 'hybrid' | 'local' | 'global' | 'naive' | 'mix';
  stream?: boolean;
  conversation_history?: Array<{ role: string; content: string }>;
}

interface QueryResponse {
  response: string;
  references?: QueryReference[];
}

export type AnswerSource = 'cloud_llm' | 'cloud_retrieval' | 'local_rag' | 'neutral';

export interface StreamMeta {
  source?: AnswerSource;
  references?: NormalizedCitation[];
  llm_error?: string;
  isInterrupted?: boolean;
}

export interface QueryReference extends AiCitationReference {
  reference_id?: string;
  file_path?: string;
  content?: string[];
}

export interface StreamPayload {
  response?: string;
  references?: QueryReference[];
  error?: string;
  answer_source?: 'llm' | 'retrieval_fallback' | string;
  llm_error?: string;
}

interface DocumentStatusCountsResponse {
  status_counts?: Record<string, number>;
}

export interface DocumentInfo {
  id: string;
  summary: string;
  status: string;
  length: number;
  created_at: string;
  updated_at: string;
}

// ==================== Helpers ====================

const aiHeaders = (): HeadersInit => ({
  'Content-Type': 'application/json',
  ...(AI_API_KEY ? { 'X-API-Key': AI_API_KEY } : {}),
});

export const getAIBackendInfo = () => {
  const hasConfiguredValue = Boolean(RAW_AI_BASE_URL.trim());
  return {
    baseUrl: AI_BASE_URL,
    host: AI_BASE_URL ? new URL(AI_BASE_URL).host : '',
    isConfigured: Boolean(AI_BASE_URL),
    configurationStatus: AI_BASE_URL
      ? 'ready'
      : hasConfiguredValue ? 'invalid' : 'missing',
  };
};

const requireAIBaseUrl = () => {
  if (!AI_BASE_URL) {
    throw new Error('Chưa cấu hình VITE_AI_API_URL bằng URL HTTPS hợp lệ.');
  }
  return AI_BASE_URL;
};

const hasNoRemoteContext = (response: string) => {
  const normalized = response.trim().toLowerCase();
  return normalized.includes('no relevant context found')
    || normalized.includes('không tìm thấy ngữ cảnh phù hợp')
    || normalized.includes('khong tim thay ngu canh phu hop');
};

const getStatusCount = (
  counts: Record<string, number> | undefined,
  key: string,
) => Number(counts?.[key] ?? counts?.[key.toUpperCase()] ?? 0) || 0;

const hasRemoteIndexedDocuments = async () => {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${AI_BASE_URL}/documents/status_counts`, {
      headers: aiHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) return false;

    const data: DocumentStatusCountsResponse = await res.json();
    return getStatusCount(data.status_counts, 'processed') > 0;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

const queryLocalFallback = async (
  query: string,
  onChunk: (text: string, meta?: StreamMeta) => void,
  onDone: (meta?: StreamMeta) => void,
) => {
  const answer = await queryLocalLegalRag(query);
  const references: NormalizedCitation[] = answer.references.map((r, i) => normalizeCitationReference(r, i));
  const meta: StreamMeta = {
    source: 'local_rag',
    references,
  };
  onChunk(answer.response, meta);
  onDone(meta);
};

// ==================== API Functions ====================

/**
 * Kiểm tra server AI còn hoạt động không
 */
export const checkAIHealth = async (): Promise<boolean> => {
  if (!AI_BASE_URL) return false;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${AI_BASE_URL}/health`, {
      headers: aiHeaders(),
      signal: controller.signal,
    });
    if (!res.ok) return false;
    return hasRemoteIndexedDocuments();
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Gửi câu hỏi tới LightRAG và nhận câu trả lời (non-streaming)
 */
export const queryAI = async (request: QueryRequest): Promise<string> => {
  if (!AI_BASE_URL) {
    const answer = await queryLocalLegalRag(request.query);
    return answer.response;
  }

  try {
    const res = await fetch(`${AI_BASE_URL}/query`, {
      method: 'POST',
      headers: aiHeaders(),
      body: JSON.stringify({
        query: request.query,
        mode: request.mode || 'hybrid',
        stream: false,
        only_need_context: false,
        response_type: 'Multiple Paragraphs',
        top_k: 60,
        include_references: true,
        include_chunk_content: true,
        conversation_history: request.conversation_history || [],
      }),
    });

    if (!res.ok) {
      const answer = await queryLocalLegalRag(request.query);
      return answer.response;
    }

    const data: QueryResponse = await res.json();
    if (hasNoRemoteContext(data.response)) {
      const answer = await queryLocalLegalRag(request.query);
      return answer.response;
    }
    return `${data.response}${formatReferencesForDisplay(data.references || [], request.query)}`;
  } catch {
    const answer = await queryLocalLegalRag(request.query);
    return answer.response;
  }
};

/**
 * Streaming query — gọi callback mỗi khi nhận chunk text mới
 */
export const queryAIStream = async (
  request: QueryRequest,
  onChunk: (text: string, meta?: StreamMeta) => void,
  onDone: (meta?: StreamMeta) => void,
  onError: (err: Error, meta?: StreamMeta) => void,
  options?: { signal?: AbortSignal },
): Promise<void> => {
  if (options?.signal?.aborted) return;
  if (!AI_BASE_URL) {
    await queryLocalFallback(request.query, onChunk, onDone);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);

  if (options?.signal) {
    options.signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  let currentSource: AnswerSource = 'neutral';
  let llmError: string | undefined;
  const references: NormalizedCitation[] = [];
  let buffer = '';
  let remoteResponse = '';
  let shouldUseLocalFallback = false;
  let hasEmittedRemoteResponse = false;

  try {
    const res = await fetch(`${AI_BASE_URL}/query/stream`, {
      method: 'POST',
      headers: aiHeaders(),
      signal: controller.signal,
      body: JSON.stringify({
        query: request.query,
        mode: request.mode || 'hybrid',
        stream: true,
        response_type: 'Multiple Paragraphs',
        top_k: 60,
        include_references: true,
        include_chunk_content: true,
        conversation_history: request.conversation_history || [],
      }),
    });

    if (!res.ok || !res.body) {
      throw new Error(`Stream failed: ${res.status}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();

    const handlePayload = (payload: StreamPayload) => {
      if (options?.signal?.aborted) return;
      if (payload.error) throw new Error(payload.error);
      if (payload.references?.length) {
        payload.references.forEach((r, idx) => {
          const norm = normalizeCitationReference(r, references.length + idx);
          const isDuplicate = references.some(
            existing =>
              (norm.referenceId && existing.referenceId === norm.referenceId) ||
              (existing.documentTitle === norm.documentTitle &&
                existing.sectionTitle === norm.sectionTitle &&
                existing.fileName === norm.fileName),
          );
          if (!isDuplicate) {
            references.push(norm);
          }
        });
      }
      if (payload.answer_source === 'retrieval_fallback') {
        currentSource = 'cloud_retrieval';
      } else if (payload.answer_source === 'llm') {
        currentSource = 'cloud_llm';
      }
      if (payload.llm_error) {
        llmError = payload.llm_error;
      }
      if (payload.response) {
        remoteResponse += payload.response;
        if (hasNoRemoteContext(payload.response)) {
          shouldUseLocalFallback = true;
          return;
        }
        hasEmittedRemoteResponse = true;
        onChunk(payload.response, {
          source: currentSource,
          references,
          llm_error: llmError,
        });
      }
    };

    const handleLine = (line: string) => {
      if (options?.signal?.aborted) return;
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        handlePayload(JSON.parse(trimmed) as StreamPayload);
      } catch (err) {
        if (err instanceof SyntaxError) {
          remoteResponse += line;
          hasEmittedRemoteResponse = true;
          onChunk(line, {
            source: currentSource,
            references,
            llm_error: llmError,
          });
          return;
        }
        throw err;
      }
    };

    let isReading = true;
    while (isReading) {
      if (options?.signal?.aborted) {
        try {
          await reader.cancel();
        } catch {
          // Stream cancelled
        }
        return;
      }
      const { done, value } = await reader.read();
      if (done) {
        isReading = false;
        continue;
      }
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() || '';
      lines.forEach(handleLine);
      const trimmedBuffer = buffer.trim();
      if (trimmedBuffer.startsWith('{') && trimmedBuffer.endsWith('}')) {
        try {
          handlePayload(JSON.parse(trimmedBuffer) as StreamPayload);
          buffer = '';
        } catch (err) {
          if (!(err instanceof SyntaxError)) throw err;
        }
      }
    }

    if (options?.signal?.aborted) return;
    if (buffer.trim()) handleLine(buffer);
    if (shouldUseLocalFallback || hasNoRemoteContext(remoteResponse)) {
      await queryLocalFallback(request.query, onChunk, onDone);
      return;
    }
    const sources = formatReferencesForDisplay(references, request.query);
    if (sources) {
      onChunk(sources, {
        source: currentSource,
        references,
        llm_error: llmError,
      });
    }
    onDone({
      source: currentSource,
      references,
      llm_error: llmError,
    });
  } catch (err) {
    if (options?.signal?.aborted) {
      return;
    }
    if (hasEmittedRemoteResponse) {
      onError(
        err instanceof Error ? err : new Error(String(err)),
        {
          source: currentSource,
          references,
          llm_error: llmError,
          isInterrupted: true,
        },
      );
      return;
    }
    try {
      await queryLocalFallback(request.query, onChunk, onDone);
    } catch (fallbackErr) {
      const remoteError = err instanceof Error ? err.message : String(err);
      const localError = fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr);
      onError(new Error(`${remoteError}. Fallback nội bộ cũng lỗi: ${localError}`));
    }
  } finally {
    clearTimeout(timeout);
  }
};

/**
 * Upload text vào LightRAG knowledge base
 */
export const uploadTextDocument = async (
  text: string,
  description?: string,
): Promise<{ status: string }> => {
  const baseUrl = requireAIBaseUrl();
  const res = await fetch(`${baseUrl}/documents/text`, {
    method: 'POST',
    headers: aiHeaders(),
    body: JSON.stringify({ text, description }),
  });

  if (!res.ok) throw new Error(`Upload failed: ${res.status}`);
  return res.json();
};

/**
 * Upload file (PDF, DOCX, TXT) vào LightRAG knowledge base
 */
export const uploadFileDocument = async (file: File): Promise<{ status: string }> => {
  const baseUrl = requireAIBaseUrl();

  const formData = new FormData();
  formData.append('file', file);

  const headers: HeadersInit = {};
  if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

  const res = await fetch(`${baseUrl}/documents/upload`, {
    method: 'POST',
    headers,
    body: formData,
  });

  if (!res.ok) throw new Error(`File upload failed: ${res.status}`);
  return res.json();
};

/**
 * Lấy danh sách tài liệu đã nạp vào knowledge base
 */
export const fetchDocuments = async (): Promise<DocumentInfo[]> => {
  const baseUrl = requireAIBaseUrl();
  const res = await fetch(`${baseUrl}/documents`, {
    headers: aiHeaders(),
  });
  if (!res.ok) throw new Error(`Fetch documents failed: ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data)) return data as DocumentInfo[];
  if (data?.statuses && typeof data.statuses === 'object') {
    return Object.values(data.statuses).flat() as DocumentInfo[];
  }
  return [];
};
