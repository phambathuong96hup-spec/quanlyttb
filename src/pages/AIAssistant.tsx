import React from 'react';
import { getAIBackendInfo } from '../services/aiService.ts';
import './AIAssistant.css';

const AIAssistant: React.FC = () => {
  const backend = getAIBackendInfo();

  if (!backend.isConfigured) {
    const detail = backend.configurationStatus === 'invalid'
      ? 'Địa chỉ dịch vụ AI không hợp lệ. Chỉ chấp nhận HTTPS, hoặc HTTP localhost trong môi trường phát triển.'
      : 'Dịch vụ AI chưa được cấu hình cho môi trường này.';

    return (
      <section className="ai-assistant-page" aria-label="TBDeviceCare-AI">
        <div
          role="status"
          style={{ maxWidth: 640, margin: '0 auto', padding: '48px 24px', textAlign: 'center' }}
        >
          <h1>Trợ lý AI chưa khả dụng</h1>
          <p>{detail}</p>
          <p>
            Quản trị viên cần đặt biến <code>VITE_AI_API_URL</code> thành địa chỉ dịch vụ AI hợp lệ.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section className="ai-assistant-page" aria-label="TBDeviceCare-AI">
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
    </section>
  );
};

export default AIAssistant;
