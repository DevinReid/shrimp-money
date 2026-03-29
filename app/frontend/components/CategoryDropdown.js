'use client';

import { useState, useEffect, useRef, memo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from './auth/AuthContext';
import { useCategories } from './CategoriesContext';
import BulkCategoryDialog from './BulkCategoryDialog';

function CategoryDropdown({ transactionId, currentCategory, onCategoryChange, merchantName, transactionName, onBulkApply, onBulkDialogOpen, skipBulkDialog, onError }) {
  const { categories, refreshCategories } = useCategories();
  const [loading, setLoading] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [showBulkDialog, setShowBulkDialog] = useState(false);
  const [lastAssignedCategory, setLastAssignedCategory] = useState(null);
  const { token } = useAuth();
  const dropdownRef = useRef(null);
  // Use ref to persist dialog state across re-renders
  const dialogShouldShowRef = useRef(false);
  
  // Use a global store to persist dialog state even if component unmounts
  if (typeof window !== 'undefined' && !window.__bulkDialogStore) {
    window.__bulkDialogStore = {
      shouldShow: false,
      transactionId: null,
      merchantName: null,
      transactionName: null,
      category: null,
      componentId: null, // Track which component instance should show the dialog
    };
  }

  // Removed excessive logging - only log when dialog should show

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    
    function handleClickOutside(event) {
      // Check if click is outside both the button and the dropdown
      const clickedButton = dropdownRef.current?.contains(event.target);
      const clickedDropdown = event.target.closest('[data-dropdown-content]');
      
      if (!clickedButton && !clickedDropdown) {
        setShowDropdown(false);
        setShowNewCategoryInput(false);
        setNewCategoryName('');
      }
    }

    // Use a small delay to avoid closing immediately when opening
    const timeout = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    
    return () => {
      clearTimeout(timeout);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showDropdown]);

  // Close dropdown when bulk dialog opens
  useEffect(() => {
    if (showBulkDialog && showDropdown) {
      setShowDropdown(false);
      setShowNewCategoryInput(false);
      setNewCategoryName('');
    }
  }, [showBulkDialog, showDropdown]);

  // Create a unique ID for this component instance (only once)
  const componentInstanceId = useRef(null);
  if (!componentInstanceId.current) {
    componentInstanceId.current = `${transactionId}-${Date.now()}-${Math.random()}`;
  }
  
  // Restore dialog state from global store - only once on mount, only if this is the correct component instance
  const hasCheckedStoreRef = useRef(false);
  useEffect(() => {
    // Only check once per component mount
    if (hasCheckedStoreRef.current) return;
    hasCheckedStoreRef.current = true;
    
    if (typeof window !== 'undefined' && window.__bulkDialogStore) {
      const store = window.__bulkDialogStore;
      // Only restore if this is the component instance that should show the dialog
      if (store.shouldShow && 
          store.transactionId === transactionId &&
          store.componentId === componentInstanceId.current &&
          !showBulkDialog) {
        dialogShouldShowRef.current = true;
        setShowBulkDialog(true);
        setLastAssignedCategory(store.category);
      }
    }
  }, []); // Only run once on mount

  // Reset dialog ref when dialog is explicitly closed
  const handleDialogClose = useCallback(() => {
    dialogShouldShowRef.current = false;
    setShowBulkDialog(false);
    // Clear global store only if this component instance owns it
    if (typeof window !== 'undefined' && window.__bulkDialogStore) {
      if (window.__bulkDialogStore.componentId === componentInstanceId.current) {
        window.__bulkDialogStore.shouldShow = false;
        window.__bulkDialogStore.transactionId = null;
        window.__bulkDialogStore.merchantName = null;
        window.__bulkDialogStore.transactionName = null;
        window.__bulkDialogStore.category = null;
        window.__bulkDialogStore.componentId = null;
      }
    }
  }, []);

  const handleCategorySelect = useCallback(async (category) => {
    if (category === currentCategory) {
      setShowDropdown(false);
      return;
    }

    // Optimistic: update UI immediately, don't wait for API
    setShowDropdown(false);
    onCategoryChange(category);

    // Show bulk dialog only if not skipped
    if (!skipBulkDialog) {
      const merchant = merchantName || transactionName;
      if (merchant && String(merchant).trim().length > 0) {
        if (onBulkDialogOpen) {
          onBulkDialogOpen({
            transactionId,
            merchantName,
            transactionName,
            category,
          });
        } else if (!showBulkDialog && !dialogShouldShowRef.current) {
          setLastAssignedCategory(category);
          dialogShouldShowRef.current = true;
          setShowBulkDialog(true);
        }
      }
    }

    // Fire API in background
    try {
      const response = await fetch(`/api/plaid/transactions/${transactionId}/category`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ category }),
      });

      const data = await response.json();
      if (!data.success) {
        console.error('Failed to save category:', data.error);
        if (onError) onError(transactionId, 'Failed to save category');
      }
    } catch (err) {
      console.error('Error updating category:', err);
      if (onError) onError(transactionId, 'Failed to save category');
    }
  }, [transactionId, currentCategory, merchantName, transactionName, token, onCategoryChange, onBulkDialogOpen, skipBulkDialog, onError]);
  
  const handleBulkApply = (count, transactionIds) => {
    // Notify parent component about bulk changes if callback provided
    if (onBulkApply) {
      onBulkApply(count, transactionIds);
    } else if (count > 0) {
      console.log(`Bulk categorized ${count} transactions`);
    }
  };

  const handleCreateCategory = async (e) => {
    e.preventDefault();
    if (!newCategoryName.trim()) return;

    setLoading(true);
    try {
      const response = await fetch('/api/plaid/categories', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ name: newCategoryName.trim() }),
      });

      const data = await response.json();
      if (data.success) {
        // Refresh categories list
        await refreshCategories();
        // Select the new category
        await handleCategorySelect(data.category.name);
        setNewCategoryName('');
        setShowNewCategoryInput(false);
      } else {
        alert('Failed to create category: ' + (data.error || 'Unknown error'));
      }
    } catch (err) {
      console.error('Error creating category:', err);
      alert('Failed to create category');
    } finally {
      setLoading(false);
    }
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Subscription': '#667eea',
      'One-time Purchase': '#10b981',
      'Bill': '#f59e0b',
      'Transfer': '#6b7280',
      'Income': '#3b82f6',
      'Other': '#8b5cf6',
      'Uncategorized': '#ef4444',
    };
    return colors[category] || '#6b7280';
  };

  const displayCategory = currentCategory || 'Uncategorized';

  const merchant = merchantName || transactionName;
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  // Calculate dropdown position when it opens - ensure it stays within viewport
  useEffect(() => {
    if (showDropdown && dropdownRef.current) {
      const updatePosition = () => {
        if (dropdownRef.current) {
          const rect = dropdownRef.current.getBoundingClientRect();
          const dropdownHeight = 300; // max-height of dropdown
          const dropdownWidth = 220; // min-width of dropdown + padding
          const viewportHeight = window.innerHeight;
          const viewportWidth = window.innerWidth;
          const padding = 10;
          
          // Calculate if dropdown would go off bottom of screen
          const spaceBelow = viewportHeight - rect.bottom - padding;
          const spaceAbove = rect.top - padding;
          
          let top;
          if (spaceBelow >= dropdownHeight || spaceBelow >= spaceAbove) {
            // Position below the button (default)
            top = rect.bottom + 4;
            // But cap it so it doesn't go off screen
            if (top + dropdownHeight > viewportHeight - padding) {
              top = Math.max(padding, viewportHeight - dropdownHeight - padding);
            }
          } else {
            // Position above the button
            top = Math.max(padding, rect.top - dropdownHeight - 4);
          }
          
          // Calculate horizontal position - ensure it doesn't go off right edge
          let left = rect.left;
          if (left + dropdownWidth > viewportWidth - padding) {
            left = Math.max(padding, viewportWidth - dropdownWidth - padding);
          }
          
          setDropdownPosition({ top, left });
        }
      };
      
      // Calculate position immediately
      updatePosition();
      
      // Update position on scroll/resize to keep it aligned
      window.addEventListener('scroll', updatePosition, true);
      window.addEventListener('resize', updatePosition);
      
      return () => {
        window.removeEventListener('scroll', updatePosition, true);
        window.removeEventListener('resize', updatePosition);
      };
    }
  }, [showDropdown]);

  const dropdownContent = showDropdown && (
    <div
      data-dropdown-content
      style={{
        position: 'fixed',
        top: `${dropdownPosition.top}px`,
        left: `${dropdownPosition.left}px`,
        background: 'white',
        border: '1px solid #e5e7eb',
        borderRadius: '8px',
        boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
        zIndex: 99998,
        minWidth: '200px',
        maxHeight: '300px',
        overflowY: 'auto',
      }}
    >
          <div style={{ padding: '8px', borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280', fontWeight: '600' }}>
            Predefined
          </div>
          {[...new Set(categories.predefined)].map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategorySelect(cat)}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                background: currentCategory === cat ? '#f3f4f6' : 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
              }}
              onMouseEnter={(e) => e.target.style.background = '#f9fafb'}
              onMouseLeave={(e) => e.target.style.background = currentCategory === cat ? '#f3f4f6' : 'transparent'}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: getCategoryColor(cat),
                }}
              />
              {cat}
            </button>
          ))}

          {categories.custom.length > 0 && (
            <>
              <div style={{ padding: '8px', borderTop: '1px solid #e5e7eb', borderBottom: '1px solid #e5e7eb', fontSize: '11px', color: '#6b7280', fontWeight: '600', marginTop: '4px' }}>
                Custom
              </div>
              {categories.custom.filter(cat => !categories.predefined.includes(cat)).map((cat) => (
                <button
                  key={cat}
                  onClick={() => handleCategorySelect(cat)}
                  style={{
                    width: '100%',
                    padding: '8px 12px',
                    textAlign: 'left',
                    background: currentCategory === cat ? '#f3f4f6' : 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#f9fafb'}
                  onMouseLeave={(e) => e.target.style.background = currentCategory === cat ? '#f3f4f6' : 'transparent'}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#8b5cf6',
                    }}
                  />
                  {cat}
                </button>
              ))}
            </>
          )}

          {showNewCategoryInput ? (
            <form onSubmit={handleCreateCategory} style={{ padding: '8px', borderTop: '1px solid #e5e7eb' }}>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="Category name"
                autoFocus
                style={{
                  width: '100%',
                  padding: '6px 8px',
                  border: '1px solid #d1d5db',
                  borderRadius: '4px',
                  fontSize: '13px',
                  marginBottom: '4px',
                }}
              />
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  type="submit"
                  disabled={loading || !newCategoryName.trim()}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: loading || !newCategoryName.trim() ? 'not-allowed' : 'pointer',
                  }}
                >
                  Create
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCategoryInput(false);
                    setNewCategoryName('');
                  }}
                  style={{
                    padding: '4px 8px',
                    background: '#e5e7eb',
                    color: '#374151',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </form>
          ) : (
            <button
              onClick={() => setShowNewCategoryInput(true)}
              style={{
                width: '100%',
                padding: '8px 12px',
                textAlign: 'left',
                background: 'transparent',
                border: 'none',
                borderTop: '1px solid #e5e7eb',
                cursor: 'pointer',
                fontSize: '13px',
                color: '#667eea',
                fontWeight: '500',
              }}
              onMouseEnter={(e) => e.target.style.background = '#f9fafb'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              + Create Custom Category
            </button>
          )}
        </div>
      );

  return (
    <>
      <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block' }}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          disabled={loading}
          style={{
            padding: '4px 12px',
            background: displayCategory === 'Uncategorized' ? '#fee2e2' : '#f3f4f6',
            border: `1px solid ${displayCategory === 'Uncategorized' ? '#fecaca' : '#d1d5db'}`,
            borderRadius: '6px',
            color: displayCategory === 'Uncategorized' ? '#991b1b' : '#374151',
            cursor: loading ? 'not-allowed' : 'pointer',
            fontSize: '12px',
            fontWeight: '500',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
          }}
        >
          <span
            style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              background: getCategoryColor(displayCategory),
            }}
          />
          {displayCategory}
          <span style={{ fontSize: '10px' }}>▼</span>
        </button>
      </div>
      
      {typeof window !== 'undefined' && dropdownContent && createPortal(dropdownContent, document.body)}
      
      {/* Only render dialog locally if parent doesn't provide onBulkDialogOpen callback */}
      {!onBulkDialogOpen && (
        <BulkCategoryDialog
          isOpen={showBulkDialog}
          onClose={handleDialogClose}
          transactionId={transactionId}
          merchantName={merchantName}
          transactionName={transactionName}
          category={lastAssignedCategory}
          onBulkApply={handleBulkApply}
        />
      )}
    </>
  );
}

// Memoize the component to prevent unnecessary re-renders
// Only re-render if key props change (onCategoryChange is handled by parent's useCallback)
export default memo(CategoryDropdown);

