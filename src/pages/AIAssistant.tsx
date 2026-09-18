import React, { useState, useRef, useEffect } from 'react';
import { Bot, Sparkles, Send, Loader2, RefreshCw, AlertCircle, BookOpen, Globe, ChevronRight } from 'lucide-react';
import { getAIBackendInfo, queryAIStream, type ChatMessage, type StreamMeta } from '../services/aiService.ts';
import './AIAssistant.css';

export type MessageSource = 'cloud_llm' | 'cloud_retrieval' | 'neutral' | 'cloud';

interface DisplayMessage extends ChatMessage {
  id: string;
  source?: MessageSource;
  references?: Array<{
    documentTitle: string;
    sectionTitle?: string;
    fileName?: string;
    excerpt?: string;
  }>;
}

const getSourceDisplay = (source?: MessageSource) => {
  switch (source) {
    case 'cloud_retrieval':
      return { label: 'Trích đoạn Cloud', className: 'retrieval' };
    case 'cloud_llm':
      return { label: 'Cloud LLM', className: 'cloud' };
    case 'neutral':
    case 'cloud':
    default:
      return { label: 'Máy chủ AI', className: 'neutral' };
  }
};

const INITIAL_SUGGESTIONS = [
  'Quy trình kiểm định máy X-quang theo quy định?',
  'Thời hạn kiểm định trang thiết bị y tế theo Nghị định 98?',
  'Định mức găng tay vô khuẩn khoa Ngoại năm 2026?',
  'Xử phạt vi phạm sử dụng thiết bị y tế chưa kiểm định?',
];

const WELCOME_MESSAGE: DisplayMessage = {
  id: 'welcome',
  role: 'assistant',
  content: `Xin chào! Tôi là Trợ lý Kỹ thuật & Pháp quy TBDeviceCare-AI.

Tôi có thể hỗ trợ bạn tra cứu và đối chiếu các thông tin:
- Quy trình kiểm định & bảo dưỡng: Căn cứ Nghị định 98/2021/NĐ-CP và Thông tư 05/2022/TT-BYT.
- Xử phạt vi phạm hành chính: Theo Nghị định 117/2020/NĐ-CP trong lĩnh vực trang thiết bị y tế.
- Định mức kỹ thuật 2026: Bảng định mức vật tư và thiết bị của 18 khoa/phòng bệnh viện.

*Trợ lý truy vấn máy chủ AI qua Internet. Nếu kết nối gặp sự cố, vui lòng thử gửi lại câu hỏi.*`,
  timestamp: Date.now(),
  source: 'neutral',
};

const AIAssistant: React.FC = () => {
  const backend = getAIBackendInfo();
  const [viewMode, setViewMode] = useState<'chat' | 'webui'>('chat');
  const [messages, setMessages] = useState<DisplayMessage[]>([WELCOME_MESSAGE]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeSource, setActiveSource] = useState<'cloud' | 'local' | 'retrieval' | 'neutral'>(
    'neutral',
  );

  const activeSessionIdRef = useRef(0);
  const activeAbortControllerRef = useRef<AbortController | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return () => {
      activeSessionIdRef.current += 1;
      if (activeAbortControllerRef.current) {
        activeAbortControllerRef.current.abort();
        activeAbortControllerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isLoading]);

  const handleResetChat = () => {
    activeSessionIdRef.current += 1;
    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }
    setIsLoading(false);
    setMessages([WELCOME_MESSAGE]);
    setActiveSource('neutral');
  };

  const handleSend = async (userQuery: string | undefined, timestamp: number) => {
    const queryText = (userQuery ?? inputValue).trim();
    if (!queryText || isLoading) return;

    if (activeAbortControllerRef.current) {
      activeAbortControllerRef.current.abort();
      activeAbortControllerRef.current = null;
    }

    activeSessionIdRef.current += 1;
    const currentSessionId = activeSessionIdRef.current;
    const controller = new AbortController();
    activeAbortControllerRef.current = controller;

    const userMessage: DisplayMessage = {
      id: `user-${currentSessionId}`,
      role: 'user',
      content: queryText,
      timestamp,
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    const assistantMsgId = `assistant-${currentSessionId}`;
    let streamedText = '';

    const addOrUpdateAssistantMessage = (
      text: string,
      source: MessageSource,
      references?: DisplayMessage['references'],
    ) => {
      if (activeSessionIdRef.current !== currentSessionId) return;
      setMessages(prev => {
        if (activeSessionIdRef.current !== currentSessionId) return prev;
        const index = prev.findIndex(m => m.id === assistantMsgId);
        const newMsg: DisplayMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: text,
          timestamp,
          source,
          references,
        };
        if (index >= 0) {
          const next = [...prev];
          next[index] = {
            ...next[index],
            content: text,
            source,
            references: references ?? next[index].references,
          };
          return next;
        }
        return [...prev, newMsg];
      });
    };

    const showConnectionError = () => {
      if (activeSessionIdRef.current !== currentSessionId) return;
      setActiveSource('neutral');
      addOrUpdateAssistantMessage('Không thể kết nối máy chủ AI. Vui lòng kiểm tra kết nối và gửi lại câu hỏi.', 'neutral');
      setIsLoading(false);
      activeAbortControllerRef.current = null;
    };
    if (!backend.isConfigured) { showConnectionError(); return; }

    try {
      let isCompleted = false;
      await queryAIStream(
        {
          query: queryText,
          mode: 'hybrid',
          conversation_history: messages
            .filter(m => m.id !== 'welcome')
            .map(m => ({ role: m.role, content: m.content })),
        },
        (chunk: string, meta?: StreamMeta) => {
          if (activeSessionIdRef.current !== currentSessionId) return;
          streamedText += chunk;
          const currentMetaSource: MessageSource = meta?.source || 'neutral';
          if (currentMetaSource === 'cloud_retrieval') {
            setActiveSource('retrieval');
          } else if (currentMetaSource === 'cloud_llm') {
            setActiveSource('cloud');
          } else {
            setActiveSource('neutral');
          }
          addOrUpdateAssistantMessage(
            streamedText,
            currentMetaSource,
            meta?.references?.map(r => ({
              documentTitle: r.documentTitle || '',
              sectionTitle: r.sectionTitle,
              fileName: r.fileName,
              excerpt: r.excerpt,
            })),
          );
        },
        (meta?: StreamMeta) => {
          if (activeSessionIdRef.current !== currentSessionId) return;
          isCompleted = true;
          setIsLoading(false);
          activeAbortControllerRef.current = null;
          const finalSource: MessageSource = meta?.source || 'neutral';
          if (finalSource === 'cloud_retrieval') {
            setActiveSource('retrieval');
          } else if (finalSource === 'cloud_llm') {
            setActiveSource('cloud');
          } else {
            setActiveSource('neutral');
          }
          if (meta?.source) {
            addOrUpdateAssistantMessage(
              streamedText,
              finalSource,
              meta?.references?.map(r => ({
                documentTitle: r.documentTitle || '',
                sectionTitle: r.sectionTitle,
                fileName: r.fileName,
                excerpt: r.excerpt,
              })),
            );
          }
        },
        (_error: Error, meta?: StreamMeta) => {
          if (activeSessionIdRef.current !== currentSessionId) return;
          setIsLoading(false);
          activeAbortControllerRef.current = null;
          if (meta?.isInterrupted || streamedText) {
            const warningNotice = '\n\n*(Phản hồi bị gián đoạn, nội dung chưa hoàn tất. Vui lòng kiểm tra lại kết nối hoặc thử gửi lại câu hỏi.)*';
            streamedText += warningNotice;
            addOrUpdateAssistantMessage(
              streamedText,
              meta?.source || 'neutral',
              meta?.references?.map(r => ({
                documentTitle: r.documentTitle || '',
                sectionTitle: r.sectionTitle,
                fileName: r.fileName,
                excerpt: r.excerpt,
              })),
            );
          } else if (!isCompleted) {
            showConnectionError();
          }
        },
        { signal: controller.signal },
      );
    } catch {
      if (activeSessionIdRef.current !== currentSessionId) return;
      if (!streamedText) {
        showConnectionError();
      } else {
        setIsLoading(false);
        activeAbortControllerRef.current = null;
      }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSend(undefined, performance.timeOrigin + e.timeStamp);
    }
  };

  return (
    <section className="ai-assistant-page" aria-label="TBDeviceCare-AI">
      <header className="ai-assistant-header">
        <div className="ai-header-brand">
          <div className="ai-avatar-badge">
            <Bot size={22} className="ai-avatar-icon" />
          </div>
          <div>
            <h1 className="ai-title">Trợ lý Kỹ thuật & Pháp quy</h1>
            <p className="ai-subtitle">Hỏi đáp văn bản pháp quy y tế & Định mức kỹ thuật 2026</p>
          </div>
        </div>

        <div className="ai-header-actions">
          <div
            className={`ai-status-indicator ${
              activeSource === 'retrieval'
                ? 'status-retrieval'
                : activeSource === 'neutral'
                ? 'status-neutral'
                : 'status-cloud'
            }`}
          >
            {activeSource === 'retrieval' ? (
              <>
                <Globe size={14} />
                <span>Trích đoạn Đám mây (Không qua LLM)</span>
              </>
            ) : activeSource === 'neutral' ? (
              <>
                <Globe size={14} />
                <span>Máy chủ AI</span>
              </>
            ) : (
              <>
                <Globe size={14} />
                <span>Máy chủ AI Đám mây</span>
              </>
            )}
          </div>

          {backend.isConfigured && (
            <div className="ai-view-tabs" role="tablist" aria-label="Chế độ hiển thị">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'chat'}
                className={`ai-tab-btn ${viewMode === 'chat' ? 'active' : ''}`}
                onClick={() => setViewMode('chat')}
              >
                Hội thoại Native
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'webui'}
                className={`ai-tab-btn ${viewMode === 'webui' ? 'active' : ''}`}
                onClick={() => setViewMode('webui')}
              >
                WebUI Không gian
              </button>
            </div>
          )}

          {viewMode === 'chat' && (
            <button
              type="button"
              className="ai-reset-btn"
              onClick={handleResetChat}
              title="Bắt đầu hội thoại mới"
              aria-label="Làm mới hội thoại"
            >
              <RefreshCw size={15} />
              <span>Làm mới</span>
            </button>
          )}
        </div>
      </header>

      {!backend.isConfigured && (
        <div className="ai-notice-banner" role="status">
          <AlertCircle size={16} />
          <span>
            Trợ lý AI chưa khả dụng trên máy chủ đám mây (cần đặt biến <code>VITE_AI_API_URL</code> thành địa chỉ dịch vụ AI hợp lệ). Vui lòng liên hệ quản trị viên để khôi phục dịch vụ.
          </span>
        </div>
      )}

      {viewMode === 'webui' && backend.isConfigured ? (
        <iframe
          className="ai-space-frame"
          src={backend.baseUrl}
          title="TBDeviceCare-AI"
          frameBorder="0"
          width="850"
          height="450"
          sandbox="allow-scripts allow-forms allow-same-origin allow-downloads"
          referrerPolicy="no-referrer"
          allow="clipboard-write"
        />
      ) : (
        <div className="ai-chat-container">
          <div className="ai-chat-messages" role="log" aria-live="polite">
            {messages.map(msg => (
              <div key={msg.id} className={`ai-message-row ${msg.role}`}>
                <div className="ai-message-bubble">
                  <div className="ai-message-header">
                    <span className="ai-sender-name">
                      {msg.role === 'user' ? 'Bạn' : 'Trợ lý TBDeviceCare'}
                    </span>
                    {msg.source && (
                      <span className={`ai-source-tag ${getSourceDisplay(msg.source).className}`}>
                        {getSourceDisplay(msg.source).label}
                      </span>
                    )}
                  </div>
                  <div className="ai-message-content">
                    {msg.content.split('\n').map((line, idx) => (
                      <React.Fragment key={idx}>
                        {line}
                        {idx < msg.content.split('\n').length - 1 && <br />}
                      </React.Fragment>
                    ))}
                  </div>

                  {msg.references && msg.references.length > 0 && (
                    <div className="ai-message-references">
                      <div className="ai-references-title">
                        <BookOpen size={14} />
                        <span>Căn cứ pháp lý & Trích dẫn tham chiếu ({msg.references.length}):</span>
                      </div>
                      <div className="ai-references-list">
                        {msg.references.map((ref, rIdx) => (
                          <div key={rIdx} className="ai-reference-item">
                            <span className="ai-reference-badge">[{rIdx + 1}]</span>
                            <div className="ai-reference-details">
                              <strong>{ref.documentTitle}</strong>
                              {(ref.sectionTitle || ref.fileName) && (
                                <small>
                                  {[ref.sectionTitle, ref.fileName].filter(Boolean).join(' • ')}
                                </small>
                              )}
                              {ref.excerpt && <p className="ai-reference-excerpt">{ref.excerpt}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isLoading && (
              <div className="ai-message-row assistant">
                <div className="ai-message-bubble loading">
                  <Loader2 size={18} className="ai-spinner" />
                  <span>Đang phân tích câu hỏi và đối soát tài liệu...</span>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {messages.length <= 1 && (
            <div className="ai-suggestions-panel">
              <div className="ai-suggestions-label">
                <Sparkles size={14} />
                <span>Gợi ý câu hỏi thường gặp:</span>
              </div>
              <div className="ai-suggestions-grid">
                {INITIAL_SUGGESTIONS.map((suggestion, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className="ai-suggestion-btn"
                    onClick={() => void handleSend(suggestion, Date.now())}
                    disabled={isLoading}
                  >
                    <span>{suggestion}</span>
                    <ChevronRight size={14} />
                  </button>
                ))}
              </div>
            </div>
          )}

          <footer className="ai-chat-input-bar">
            <div className="ai-input-wrapper">
              <textarea
                ref={inputRef}
                className="ai-chat-textarea"
                placeholder="Nhập câu hỏi về quy trình, quy chuẩn kỹ thuật hoặc định mức vật tư..."
                rows={1}
                value={inputValue}
                onChange={e => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isLoading}
              />
              <button
                type="button"
                className="ai-send-btn"
                onClick={() => void handleSend(undefined, Date.now())}
                disabled={!inputValue.trim() || isLoading}
                aria-label="Gửi câu hỏi"
              >
                {isLoading ? <Loader2 size={16} className="ai-spinner" /> : <Send size={16} />}
              </button>
            </div>
            <div className="ai-input-hint">
              <small>Nhấn Enter để gửi, Shift + Enter để xuống dòng. Kết quả chỉ phục vụ tham khảo kỹ thuật và đối chiếu quy chế.</small>
            </div>
          </footer>
        </div>
      )}
    </section>
  );
};

export default AIAssistant;
