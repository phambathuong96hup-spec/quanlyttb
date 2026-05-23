import React from 'react';
import './Table.css';

interface TableProps {
  children: React.ReactNode;
  className?: string;
}

export const Table: React.FC<TableProps> = ({ children, className = '' }) => {
  return (
    <div className={`table-container ${className}`}>
      <table className="data-table">{children}</table>
    </div>
  );
};

export const TableHead: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <thead>{children}</thead>;
};

export const TableBody: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  return <tbody>{children}</tbody>;
};

export const TableRow: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => {
  return <tr className={className}>{children}</tr>;
};

export const TableHeader: React.FC<{ children: React.ReactNode; className?: string; style?: React.CSSProperties }> = ({ children, className = '', style }) => {
  return <th className={className} style={style}>{children}</th>;
};

export const TableCell: React.FC<{ children: React.ReactNode; className?: string; colSpan?: number; style?: React.CSSProperties }> = ({ children, className = '', colSpan, style }) => {
  return <td className={className} colSpan={colSpan} style={style}>{children}</td>;
};
