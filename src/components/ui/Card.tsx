import React from 'react';
import './Card.css';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const Card: React.FC<CardProps> = ({ children, className = '', style }) => {
  return <div className={`card ${className}`} style={style}>{children}</div>;
};

interface CardHeaderProps {
  title: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export const CardHeader: React.FC<CardHeaderProps> = ({ title, action, className = '' }) => {
  return (
    <div className={`card-header ${className}`}>
      <h3 className="card-title">{title}</h3>
      {action && <div className="card-action">{action}</div>}
    </div>
  );
};

interface CardBodyProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export const CardBody: React.FC<CardBodyProps> = ({ children, className = '', style }) => {
  return <div className={`card-body ${className}`} style={style}>{children}</div>;
};

export default { Card, CardHeader, CardBody };
