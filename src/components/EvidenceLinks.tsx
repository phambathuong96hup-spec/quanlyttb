import React from 'react';
import { ExternalLink, Image } from 'lucide-react';
import { extractEvidenceLinks } from '../utils/evidenceUtils';
import './EvidenceLinks.css';

interface EvidenceLinksProps {
  text: unknown;
  className?: string;
}

export const EvidenceLinks: React.FC<EvidenceLinksProps> = ({ text, className = '' }) => {
  const links = extractEvidenceLinks(text);
  if (links.length === 0) return null;

  return (
    <div className={`evidence-links ${className}`.trim()} aria-label="Ảnh minh chứng">
      {links.map((link, index) => (
        <a
          key={`${link.url}-${index}`}
          className="evidence-link"
          href={link.url}
          target="_blank"
          rel="noreferrer"
        >
          <Image size={14} />
          <span>{link.label}</span>
          <ExternalLink size={12} />
        </a>
      ))}
    </div>
  );
};
