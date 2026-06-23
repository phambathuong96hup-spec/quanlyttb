/**
 * AI Service — LightRAG API Client
 * Kết nối tới LightRAG server trên HuggingFace Spaces, có fallback RAG nội bộ.
 */

import { queryLocalLegalRag } from './legalRagService.ts';
import { formatReferencesForDisplay, type AiCitationReference } from './aiCitations.ts';

const AI_BASE_URL = (import.meta.env.VITE_AI_API_URL || '').replace(/\/+$/, '');
const AI_API_KEY = import.meta.env.VITE_AI_API_KEY || '';

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

interface QueryReference extends AiCitationReference {
  reference_id?: string;
  file_path?: string;
  content?: string[];
}

interface StreamPayload {
  response?: string;
  references?: QueryReference[];
  error?: string;
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
  let host = '';
  try {
    host = AI_BASE_URL ? new URL(AI_BASE_URL).host : '';
  } catch {
    host = AI_BASE_URL;
  }
  return {
    baseUrl: AI_BASE_URL,
    host,
    isConfigured: Boolean(AI_BASE_URL),
  };
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
  onChunk: (text: string) => void,
  onDone: () => void,
) => {
  const answer = await queryLocalLegalRag(query);
  onChunk(answer.response);
  onDone();
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
    return `${data.response}${formatReferencesForDisplay(data.references || [])}`;
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
  onChunk: (text: string) => void,
  onDone: () => void,
  onError: (err: Error) => void,
): Promise<void> => {
  if (!AI_BASE_URL) {
    await queryLocalFallback(request.query, onChunk, onDone);
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
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
    const references: QueryReference[] = [];
    let buffer = '';
    let remoteResponse = '';
    let shouldUseLocalFallback = false;

    const handlePayload = (payload: StreamPayload) => {
      if (payload.error) throw new Error(payload.error);
      if (payload.references?.length) references.push(...payload.references);
      if (payload.response) {
        remoteResponse += payload.response;
        if (hasNoRemoteContext(payload.response)) {
          shouldUseLocalFallback = true;
          return;
        }
        hasEmittedRemoteResponse = true;
        onChunk(payload.response);
      }
    };

    const handleLine = (line: string) => {
      const trimmed = line.trim();
      if (!trimmed) return;

      try {
        handlePayload(JSON.parse(trimmed) as StreamPayload);
      } catch (err) {
        if (err instanceof SyntaxError) {
          remoteResponse += line;
          hasEmittedRemoteResponse = true;
          onChunk(line);
          return;
        }
        throw err;
      }
    };

    let isReading = true;
    while (isReading) {
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

    if (buffer.trim()) handleLine(buffer);
    if (shouldUseLocalFallback || hasNoRemoteContext(remoteResponse)) {
      await queryLocalFallback(request.query, onChunk, onDone);
      return;
    }
    const sources = formatReferencesForDisplay(references);
    if (sources) onChunk(sources);
    onDone();
  } catch (err) {
    if (hasEmittedRemoteResponse) {
      onDone();
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
  const res = await fetch(`${AI_BASE_URL}/documents/text`, {
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
  if (!AI_BASE_URL) throw new Error('Chưa cấu hình VITE_AI_API_URL.');

  const formData = new FormData();
  formData.append('file', file);

  const headers: HeadersInit = {};
  if (AI_API_KEY) headers['X-API-Key'] = AI_API_KEY;

  const res = await fetch(`${AI_BASE_URL}/documents/upload`, {
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
  const res = await fetch(`${AI_BASE_URL}/documents`, {
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
