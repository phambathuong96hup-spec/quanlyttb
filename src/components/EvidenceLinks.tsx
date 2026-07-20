import React from 'react';
import { ExternalLink, FileVideo, Image } from 'lucide-react';
import { extractEvidenceLinks, isVideoEvidenceLabel } from '../utils/evidenceUtils';
import './EvidenceLinks.css';

interface EvidenceLinksProps {
  text: unknown;
  className?: string;
}

export const EvidenceLinks: React.FC<EvidenceLinksProps> = ({ text, className = '' }) => {
  const links = extractEvidenceLinks(text);
  if (links.length === 0) return null;

  return (
    <div className={`evidence-links ${className}`.trim()} aria-label="Tệp minh chứng">
      {links.map((link, index) => {
        const isVideo = isVideoEvidenceLabel(link.label);
        return (
          <a
            key={`${link.url}-${index}`}
            className="evidence-link"
            href={link.url}
            target="_blank"
            rel="noreferrer"
          >
            {isVideo ? <FileVideo size={14} aria-hidden="true" /> : <Image size={14} aria-hidden="true" />}
            <span>{link.label}</span>
            <ExternalLink size={12} aria-hidden="true" />
          </a>
        );
      })}
    </div>
  );
};
