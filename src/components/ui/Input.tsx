import React, { useId } from 'react';
import './Input.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: React.ReactNode;
  error?: string;
  className?: string;
}

const Input: React.FC<InputProps> = ({ 
  label, 
  icon, 
  error, 
  className = '', 
  id, 
  ...props 
}) => {
  const generatedId = useId();
  const inputId = id || generatedId;

  return (
    <div className={`input-group ${className}`}>
      {label && (
        <label htmlFor={inputId} className="input-label">
          {label}
        </label>
      )}
      <div className="input-wrapper">
        {icon && <div className="input-icon">{icon}</div>}
        <input
          id={inputId}
          className={`input-field ${icon ? 'has-icon' : ''} ${error ? 'is-invalid' : ''}`}
          {...props}
        />
      </div>
      {error && <span className="input-error">{error}</span>}
    </div>
  );
};

export default Input;
