import React from 'react';
import './Card.css';

interface CardProps {
  children: React.ReactNode;
  title?: string;
  className?: string;
}

export const Card: React.FC<CardProps> = ({ children, title, className = '' }) => {
  return (
    <div className={`card glass-panel ${className}`}>
      {title && <div className="card-header"><h3 className="card-title">{title}</h3></div>}
      <div className="card-body">
        {children}
      </div>
    </div>
  );
};
