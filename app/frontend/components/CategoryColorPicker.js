'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';

// Beautiful color palette with outlined squares
const COLOR_PALETTE = [
  '#10b981', // green
  '#667eea', // purple
  '#f59e0b', // amber
  '#ef4444', // red
  '#ec4899', // pink
  '#8b5cf6', // violet
  '#06b6d4', // cyan
  '#f97316', // orange
  '#14b8a6', // teal
  '#22c55e', // emerald
  '#84cc16', // lime
  '#eab308', // yellow
  '#6366f1', // indigo
  '#a855f7', // purple
  '#0ea5e9', // sky
  '#3b82f6', // blue
  '#f43f5e', // rose
  '#8b5a3c', // brown
  '#64748b', // slate
  '#9ca3af', // gray
];

export default function CategoryColorPicker({ category, currentColor, onColorChange, onClose, position = { x: 0, y: 0 } }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [modalPosition, setModalPosition] = useState({ left: 0, top: 0 });
  const { token } = useAuth();
  
  // Calculate modal position on mount and when position changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const modalWidth = 400;
    const modalHeight = 350; // Approximate height
    const padding = 20;
    
    // Start position: below and centered on the click
    let left = position.x - modalWidth / 2;
    let top = position.y + 10; // 10px below click
    
    // Ensure it doesn't go off-screen horizontally
    if (left < padding) {
      left = padding;
    } else if (left + modalWidth > window.innerWidth - padding) {
      left = window.innerWidth - modalWidth - padding;
    }
    
    // If too close to bottom, show above instead
    if (top + modalHeight > window.innerHeight - padding) {
      top = position.y - modalHeight - 10; // Above the click
    }
    
    // Ensure it doesn't go off top
    if (top < padding) {
      top = padding;
    }
    
    setModalPosition({ left, top });
  }, [position]);

  const handleColorSelect = async (color) => {
    try {
      setSaving(true);
      setError(null);

      const response = await fetch('/api/plaid/category-colors', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          category,
          color,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.success) {
        onColorChange(color);
        // Close after a brief delay to show success
        setTimeout(() => {
          onClose();
        }, 300);
      }
    } catch (err) {
      console.error('Error saving category color:', err);
      setError('Failed to save color');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div 
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(0, 0, 0, 0.5)',
        zIndex: 1000,
      }} 
      onClick={onClose}
    >
      <div 
        style={{
          position: 'absolute',
          left: `${modalPosition.left}px`,
          top: `${modalPosition.top}px`,
          background: 'white',
          borderRadius: '16px',
          padding: '24px',
          width: '400px',
          maxWidth: '90vw',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
        }} 
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '20px',
        }}>
          <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
            Choose Color for {category}
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              fontSize: '24px',
              cursor: 'pointer',
              color: '#6b7280',
              padding: '0',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: '6px',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = '#f3f4f6'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'none'}
          >
            ×
          </button>
        </div>

        {error && (
          <div style={{
            padding: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '8px',
            color: '#991b1b',
            fontSize: '14px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '12px',
          marginBottom: '20px',
        }}>
          {COLOR_PALETTE.map((color) => {
            const isSelected = color === currentColor;
            return (
              <button
                key={color}
                onClick={() => handleColorSelect(color)}
                disabled={saving}
                style={{
                  width: '56px',
                  height: '56px',
                  borderRadius: '12px',
                  background: color,
                  border: isSelected 
                    ? '3px solid #1f2937' 
                    : '3px solid rgba(0, 0, 0, 0.1)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  position: 'relative',
                  transition: 'all 0.2s',
                  boxShadow: isSelected 
                    ? '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' 
                    : '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                  opacity: saving ? 0.6 : 1,
                }}
                onMouseEnter={(e) => {
                  if (!saving && !isSelected) {
                    e.currentTarget.style.transform = 'scale(1.1)';
                    e.currentTarget.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.transform = 'scale(1)';
                    e.currentTarget.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
                  }
                }}
              >
                {isSelected && (
                  <div style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    color: '#ffffff',
                    fontSize: '20px',
                    fontWeight: 'bold',
                    textShadow: '0 1px 2px rgba(0, 0, 0, 0.3)',
                  }}>
                    ✓
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {saving && (
          <div style={{
            textAlign: 'center',
            color: '#6b7280',
            fontSize: '14px',
            marginTop: '12px',
          }}>
            Saving...
          </div>
        )}
      </div>
    </div>
  );
}

