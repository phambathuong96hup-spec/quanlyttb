import React from 'react';
import './AIAssistant.css';

const AI_SPACE_URL = 'https://pbthuong-ai.hf.space';

const AIAssistant: React.FC = () => {
  return (
    <section className="ai-assistant-page" aria-label="TBDeviceCare-AI">
      <iframe
        className="ai-space-frame"
        src={AI_SPACE_URL}
        title="TBDeviceCare-AI"
        frameBorder="0"
        width="850"
        height="450"
        allow="clipboard-read; clipboard-write; fullscreen"
      />
    </section>
  );
};

export default AIAssistant;
