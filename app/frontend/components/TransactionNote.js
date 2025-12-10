'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import { createPortal } from 'react-dom';

export default function TransactionNote({ transactionId, currentNote, onNoteChange }) {
  const [note, setNote] = useState(currentNote || '');
  const [showDialog, setShowDialog] = useState(false);
  const [loading, setLoading] = useState(false);
  const [tempNote, setTempNote] = useState(currentNote || '');
  const { token } = useAuth();
  const dialogRef = useRef(null);
  const [dialogPosition, setDialogPosition] = useState({ top: 0, left: 0 });
  const buttonRef = useRef(null);

  // Update local state when prop changes
  useEffect(() => {
    setNote(currentNote || '');
    setTempNote(currentNote || '');
  }, [currentNote]);

  // Calculate dialog position
  useEffect(() => {
    if (showDialog && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      const dialogWidth = 320;
      const dialogHeight = 200;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 10;

      // Position below button, but adjust if it would go off screen
      let top = rect.bottom + 4;
      let left = rect.left;

      // Adjust if would go off bottom
      if (top + dialogHeight > viewportHeight - padding) {
        top = Math.max(padding, rect.top - dialogHeight - 4);
      }

      // Adjust if would go off right
      if (left + dialogWidth > viewportWidth - padding) {
        left = Math.max(padding, viewportWidth - dialogWidth - padding);
      }

      setDialogPosition({ top, left });
    }
  }, [showDialog]);

  // Close dialog on outside click
  useEffect(() => {
    if (!showDialog) return;

    const handleClickOutside = (e) => {
      if (dialogRef.current && !dialogRef.current.contains(e.target) && 
          buttonRef.current && !buttonRef.current.contains(e.target)) {
        setShowDialog(false);
        setTempNote(note); // Reset to saved note
      }
    };

    setTimeout(() => document.addEventListener('mousedown', handleClickOutside), 0);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDialog, note]);

  const handleSave = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/plaid/transactions/${transactionId}/note`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ note: tempNote.trim() }),
      });

      const data = await response.json();

      if (data.success) {
        setNote(data.note || '');
        setShowDialog(false);
        // Notify parent if callback provided
        if (onNoteChange) {
          onNoteChange(data.note || '');
        }
      } else {
        alert('Failed to save note: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error saving note:', err);
      alert('Failed to save note');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this note?')) {
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(`/api/plaid/transactions/${transactionId}/note`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.success) {
        setNote('');
        setTempNote('');
        setShowDialog(false);
        // Notify parent if callback provided
        if (onNoteChange) {
          onNoteChange('');
        }
      } else {
        alert('Failed to delete note: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error deleting note:', err);
      alert('Failed to delete note');
    } finally {
      setLoading(false);
    }
  };

  const dialogContent = showDialog && (
    <div
      ref={dialogRef}
      style={{
        position: 'fixed',
        top: `${dialogPosition.top}px`,
        left: `${dialogPosition.left}px`,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 10px 25px rgba(0,0,0,0.15)',
        zIndex: 99999,
        width: '320px',
        padding: '16px',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div style={{ marginBottom: '12px' }}>
        <label style={{ display: 'block', fontSize: '12px', fontWeight: '500', marginBottom: '6px', color: '#374151' }}>
          Note
        </label>
        <textarea
          value={tempNote}
          onChange={(e) => setTempNote(e.target.value)}
          placeholder="Add a note about this transaction..."
          style={{
            width: '100%',
            minHeight: '80px',
            padding: '8px',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '13px',
            fontFamily: 'inherit',
            resize: 'vertical',
          }}
          autoFocus
        />
      </div>
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        {note && (
          <button
            onClick={handleDelete}
            disabled={loading}
            style={{
              padding: '6px 12px',
              background: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.6 : 1,
            }}
          >
            Delete
          </button>
        )}
        <button
          onClick={() => {
            setShowDialog(false);
            setTempNote(note); // Reset to saved note
          }}
          disabled={loading}
          style={{
            padding: '6px 12px',
            background: '#f3f4f6',
            color: '#374151',
            border: '1px solid #d1d5db',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={loading}
          style={{
            padding: '6px 12px',
            background: loading ? '#9ca3af' : '#667eea',
            color: 'white',
            border: 'none',
            borderRadius: '6px',
            fontSize: '12px',
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <button
        ref={buttonRef}
        onClick={() => setShowDialog(true)}
        title={note ? `Note: ${note}` : 'Add note'}
        style={{
          padding: '4px 8px',
          background: note ? '#dbeafe' : '#f3f4f6',
          border: note ? '1px solid #93c5fd' : '1px solid #d1d5db',
          borderRadius: '6px',
          color: note ? '#1e40af' : '#6b7280',
          cursor: 'pointer',
          fontSize: '12px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>{note ? '📝' : '📄'}</span>
        {note && <span style={{ fontSize: '10px' }}>Note</span>}
      </button>
      {typeof window !== 'undefined' && dialogContent && createPortal(dialogContent, document.body)}
    </>
  );
}





