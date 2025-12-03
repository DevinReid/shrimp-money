'use client';

import React from 'react';
import './ShrimpSpinner.css';

export default function ShrimpSpinner({ size = 'large' }) {
  const sizeClass = size === 'small' ? 'shrimp-spinner-small' : 
                    size === 'medium' ? 'shrimp-spinner-medium' : 
                    'shrimp-spinner-large';

  return (
    <div className={`shrimp-spinner ${sizeClass}`}>
      <span className="shrimp-emoji">🦐</span>
    </div>
  );
}


