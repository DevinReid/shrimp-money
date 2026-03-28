'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './auth/AuthContext';
import { useCategories } from './CategoriesContext';
import CategoryDropdown from './CategoryDropdown';
import AddRuleButton from './AddRuleButton';
import TransactionNote from './TransactionNote';

// Utility functions moved outside component to avoid initialization issues
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

export default function UncategorizedTransactionsView({ refreshTrigger, onBulkDialogOpen, onRulesApplied, onDeleteTransaction: parentDeleteTransaction }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [applyingRules, setApplyingRules] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkCategory, setBulkCategory] = useState('');
  const [bulkApplying, setBulkApplying] = useState(false);
  const [applyProgress, setApplyProgress] = useState(null); // { percent, message }
  const { token } = useAuth();
  const { categories } = useCategories();
  const progressTimerRef = useRef(null);

  const fetchUncategorized = useCallback(async () => {
    if (!token) return;

    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/plaid/transactions/uncategorized', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.transactions) {
        setTransactions(data.transactions);
        // Clear selection when data refreshes
        setSelectedIds(new Set());
      }
    } catch (err) {
      console.error('Error fetching uncategorized transactions:', err);
      setError('Failed to fetch uncategorized transactions');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Refresh when refreshTrigger changes (but not on initial mount)
  const prevRefreshTriggerRef = useRef(refreshTrigger);
  useEffect(() => {
    if (refreshTrigger !== undefined && refreshTrigger !== prevRefreshTriggerRef.current) {
      prevRefreshTriggerRef.current = refreshTrigger;
      if (refreshTrigger > 0) {
        fetchUncategorized();
      }
    }
  }, [refreshTrigger, fetchUncategorized]);

  useEffect(() => {
    fetchUncategorized();
  }, [fetchUncategorized]);

  // Cleanup progress timer on unmount
  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    };
  }, []);

  const handleCategoryChange = useCallback((transactionId, newCategory) => {
    // Don't remove immediately - the bulk dialog will handle removal
  }, []);

  const handleNoteChange = useCallback((transactionId, newNote) => {
    setTransactions(prev => prev.map(t =>
      t.transaction_id === transactionId
        ? { ...t, userNote: newNote || null }
        : t
    ));
  }, []);

  // --- Selection handlers ---
  const handleToggleSelect = useCallback((transactionId) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(transactionId)) {
        next.delete(transactionId);
      } else {
        next.add(transactionId);
      }
      return next;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedIds(new Set(filteredTransactions.map(t => t.transaction_id)));
  }, []);

  const handleSelectNone = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  const isAllSelected = filteredTransactions.length > 0 && selectedIds.size === filteredTransactions.length;

  // --- Bulk categorize handler ---
  const handleBulkAssign = useCallback(async (createRule = false) => {
    if (!token || !bulkCategory || selectedIds.size === 0) return;

    try {
      setBulkApplying(true);
      setError(null);

      const selectedTransactions = transactions.filter(t => selectedIds.has(t.transaction_id));
      const transactionIds = selectedTransactions.map(t => t.transaction_id);

      // Bulk categorize the selected transactions
      const response = await fetch('/api/plaid/transactions/bulk-categorize', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'apply',
          category: bulkCategory,
          transactionIds,
          referenceTransactionId: selectedTransactions[0]?.transaction_id,
          merchantName: selectedTransactions[0]?.merchant_name || selectedTransactions[0]?.name,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setError(data.error || 'Failed to bulk categorize');
        return;
      }

      // Optionally create a rule
      if (createRule && selectedTransactions[0]) {
        const ref = selectedTransactions[0];
        await fetch('/api/plaid/rules/from-transaction', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transactionName: ref.name,
            merchantName: ref.merchant_name,
            category: bulkCategory,
            transactionId: ref.transaction_id,
          }),
        });
      }

      // Clear selection and refresh
      setSelectedIds(new Set());
      setBulkCategory('');
      await fetchUncategorized();
      if (onRulesApplied) onRulesApplied();

    } catch (err) {
      console.error('Error bulk categorizing:', err);
      setError('Failed to bulk categorize');
    } finally {
      setBulkApplying(false);
    }
  }, [token, bulkCategory, selectedIds, transactions, fetchUncategorized, onRulesApplied]);

  // --- Apply rules with progress ---
  const handleApplyRules = useCallback(async () => {
    if (!token) return;

    try {
      setApplyingRules(true);
      setError(null);
      setApplyProgress({ percent: 0, message: 'Applying rules...' });

      // Animate progress from 0 to ~85% while waiting for API
      let currentPercent = 0;
      progressTimerRef.current = setInterval(() => {
        currentPercent = Math.min(currentPercent + Math.random() * 8 + 2, 85);
        setApplyProgress(prev => prev ? {
          ...prev,
          percent: currentPercent,
          message: currentPercent < 40 ? 'Applying rules...' : currentPercent < 70 ? 'Fuzzy matching...' : 'Finishing up...',
        } : null);
      }, 300);

      const response = await fetch('/api/plaid/rules/apply', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      });

      const data = await response.json();

      // Stop the animation
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }

      if (data.success) {
        const total = (data.applied || 0) + (data.fuzzyApplied || 0);
        const parts = [];
        if (data.applied) parts.push(`${data.applied} by rules`);
        if (data.fuzzyApplied) parts.push(`${data.fuzzyApplied} by fuzzy match`);
        if (data.suggested) parts.push(`${data.suggested} suggested`);

        setApplyProgress({
          percent: 100,
          message: total > 0
            ? `Categorized ${total} transaction${total !== 1 ? 's' : ''} (${parts.join(', ')})`
            : 'No new matches found',
        });

        // Hold the completion message, then refresh
        setTimeout(async () => {
          setApplyProgress(null);
          await fetchUncategorized();
          if (onRulesApplied) onRulesApplied();
        }, 2500);
      } else {
        setApplyProgress(null);
        setError(data.error || 'Failed to apply rules');
      }
    } catch (err) {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
        progressTimerRef.current = null;
      }
      setApplyProgress(null);
      console.error('Error applying rules:', err);
      setError('Failed to apply rules');
    } finally {
      setApplyingRules(false);
    }
  }, [token, fetchUncategorized, onRulesApplied]);

  const handleBulkCategoryChange = useCallback(async (count, transactionIds) => {
    const idsToRemove = transactionIds || [];
    setTransactions(prev => {
      let filtered = prev.filter(t => !idsToRemove.includes(t.transaction_id));
      return filtered;
    });
    await fetchUncategorized();
    if (onRulesApplied) onRulesApplied();
  }, [fetchUncategorized, onRulesApplied]);

  // Use parent's delete handler if provided, otherwise use local one
  const handleDeleteTransaction = useCallback(async (transactionId, transactionName, amount, date) => {
    if (parentDeleteTransaction) {
      await parentDeleteTransaction(transactionId, transactionName, amount, date);
      setTransactions(prev => prev.filter(t => t.transaction_id !== transactionId));
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.delete(transactionId);
        return next;
      });
    } else {
      const transactionDisplay = transactionName || 'this transaction';
      const amountDisplay = formatCurrency(Math.abs(amount));
      const dateDisplay = formatDate(date);

      const confirmMessage = `Are you sure you want to permanently delete this transaction?\n\n` +
        `Transaction: ${transactionDisplay}\n` +
        `Amount: ${amountDisplay}\n` +
        `Date: ${dateDisplay}\n\n` +
        `This action cannot be undone. The transaction will be removed from the database.`;

      if (!window.confirm(confirmMessage)) {
        return;
      }

      try {
        setLoading(true);
        const response = await fetch(`/api/plaid/transactions/${transactionId}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        const data = await response.json();

        if (data.success) {
          setTransactions(prev => prev.filter(t => t.transaction_id !== transactionId));
          setSelectedIds(prev => {
            const next = new Set(prev);
            next.delete(transactionId);
            return next;
          });
        } else {
          alert('Failed to delete transaction: ' + (data.error || 'Unknown error'));
        }
      } catch (err) {
        console.error('Error deleting transaction:', err);
        alert('Failed to delete transaction');
      } finally {
        setLoading(false);
      }
    }
  }, [parentDeleteTransaction, token]);

  // Filter transactions based on search query
  const filteredTransactions = transactions.filter(transaction => {
    if (!searchQuery.trim()) return true;

    const query = searchQuery.toLowerCase().trim();

    if (transaction.name?.toLowerCase().includes(query)) return true;
    if (transaction.merchant_name?.toLowerCase().includes(query)) return true;

    const amountStr = Math.abs(transaction.amount).toFixed(2);
    if (amountStr.includes(query.replace('$', '').replace(',', ''))) return true;

    const dateStr = formatDate(transaction.date).toLowerCase();
    if (dateStr.includes(query)) return true;

    return false;
  });

  // Gather all category options
  const allCategories = [...new Set([
    ...(categories?.predefined || []),
    ...(categories?.custom || []),
  ])].filter(c => c && c !== 'Uncategorized');

  if (loading && transactions.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading uncategorized transactions...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 0', width: 'calc(100% + 40px)', margin: '0 -20px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
          Uncategorized Transactions
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleApplyRules}
            disabled={applyingRules || loading}
            style={{
              padding: '10px 20px',
              background: applyingRules || loading ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: applyingRules || loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {applyingRules ? '⏳ Applying...' : '🚀 Apply Rules to All'}
          </button>
          <button
            onClick={fetchUncategorized}
            disabled={loading || applyingRules}
            style={{
              padding: '10px 20px',
              background: loading || applyingRules ? '#9ca3af' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading || applyingRules ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Progress bar for Apply Rules */}
      {applyProgress && (
        <div style={{
          marginBottom: '16px',
          background: '#f3f4f6',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          padding: '14px 16px',
          overflow: 'hidden',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '13px' }}>
            <span style={{ color: '#374151', fontWeight: '500' }}>{applyProgress.message}</span>
            <span style={{ color: '#6b7280' }}>{Math.round(applyProgress.percent)}%</span>
          </div>
          <div style={{
            height: '8px',
            background: '#e5e7eb',
            borderRadius: '4px',
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              width: `${applyProgress.percent}%`,
              background: applyProgress.percent >= 100
                ? '#10b981'
                : 'linear-gradient(90deg, #667eea, #a78bfa)',
              borderRadius: '4px',
              transition: 'width 0.3s ease-out',
            }} />
          </div>
        </div>
      )}

      {error && (
        <div style={{
          padding: '12px',
          background: '#fee2e2',
          border: '1px solid #fecaca',
          borderRadius: '6px',
          color: '#991b1b',
          marginBottom: '20px',
        }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {transactions.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ color: '#6b7280', fontSize: '18px', marginBottom: '10px' }}>
            🎉 All transactions are categorized!
          </p>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            All your transactions have been assigned a category.
          </p>
        </div>
      ) : (
        <div>
          <div style={{
            padding: '12px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: '6px',
            marginBottom: '20px',
            fontSize: '14px',
            color: '#991b1b',
          }}>
            <strong>{transactions.length}</strong> transaction{transactions.length !== 1 ? 's' : ''} need{transactions.length === 1 ? 's' : ''} categorization
            {searchQuery && (
              <span style={{ marginLeft: '10px', color: '#dc2626' }}>
                ({filteredTransactions.length} matching search)
              </span>
            )}
          </div>

          {/* Search Bar */}
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Search by merchant, description, amount, or date..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '8px',
                fontSize: '14px',
                boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  marginTop: '8px',
                  padding: '6px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  color: '#6b7280',
                }}
              >
                Clear search
              </button>
            )}
          </div>

          {/* Bulk Action Bar */}
          {selectedIds.size > 0 && (
            <div style={{
              padding: '12px 16px',
              background: 'linear-gradient(135deg, #eff6ff, #f0e6ff)',
              border: '1px solid #c7d2fe',
              borderRadius: '8px',
              marginBottom: '16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              flexWrap: 'wrap',
            }}>
              <span style={{ fontWeight: '600', fontSize: '14px', color: '#4338ca' }}>
                {selectedIds.size} selected
              </span>

              <select
                value={bulkCategory}
                onChange={(e) => setBulkCategory(e.target.value)}
                style={{
                  padding: '6px 10px',
                  border: '1px solid #c7d2fe',
                  borderRadius: '6px',
                  fontSize: '13px',
                  background: 'white',
                  minWidth: '160px',
                }}
              >
                <option value="">Choose category...</option>
                {allCategories.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>

              <button
                onClick={() => handleBulkAssign(false)}
                disabled={!bulkCategory || bulkApplying}
                style={{
                  padding: '6px 14px',
                  background: !bulkCategory || bulkApplying ? '#9ca3af' : '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: !bulkCategory || bulkApplying ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                {bulkApplying ? 'Applying...' : 'Apply to Selected'}
              </button>

              <button
                onClick={() => handleBulkAssign(true)}
                disabled={!bulkCategory || bulkApplying}
                style={{
                  padding: '6px 14px',
                  background: !bulkCategory || bulkApplying ? '#9ca3af' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: !bulkCategory || bulkApplying ? 'not-allowed' : 'pointer',
                  fontSize: '13px',
                  fontWeight: '500',
                }}
              >
                {bulkApplying ? 'Applying...' : 'Apply + Create Rule'}
              </button>

              <button
                onClick={handleSelectNone}
                style={{
                  padding: '6px 12px',
                  background: 'white',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#6b7280',
                  marginLeft: 'auto',
                }}
              >
                Clear
              </button>
            </div>
          )}

          {filteredTransactions.length === 0 && searchQuery ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}>
              <p style={{ color: '#6b7280', fontSize: '18px', marginBottom: '10px' }}>
                No transactions match your search
              </p>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                Try a different search term or{' '}
                <button
                  onClick={() => setSearchQuery('')}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#667eea',
                    cursor: 'pointer',
                    textDecoration: 'underline',
                    fontSize: '14px',
                  }}
                >
                  clear your search
                </button>
              </p>
            </div>
          ) : (
            <div style={{
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}>
            {/* Table header */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '40px 1.5fr 0.8fr 0.8fr 1.3fr auto',
              gap: '8px',
              padding: '12px 10px',
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: '600',
              fontSize: '14px',
              color: '#6b7280',
              alignItems: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  onChange={isAllSelected ? handleSelectNone : handleSelectAll}
                  style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#667eea' }}
                  title={isAllSelected ? 'Deselect all' : 'Select all'}
                />
              </div>
              <div>Merchant / Description</div>
              <div>Date</div>
              <div style={{ textAlign: 'right' }}>Amount</div>
              <div>Category</div>
              <div style={{ textAlign: 'center' }}>Actions</div>
            </div>

            {/* Table rows */}
            {filteredTransactions.map((transaction, index) => {
              const isSelected = selectedIds.has(transaction.transaction_id);
              return (
              <div
                key={transaction.transaction_id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '40px 1.5fr 0.8fr 0.8fr 1.3fr auto',
                  gap: '8px',
                  padding: '12px 10px',
                  borderBottom: index < filteredTransactions.length - 1 ? '1px solid #e5e7eb' : 'none',
                  background: isSelected
                    ? (index % 2 === 0 ? '#eff6ff' : '#e8f0fe')
                    : '#fef2f2',
                  borderLeft: isSelected ? '3px solid #667eea' : '3px solid transparent',
                  transition: 'background 0.15s, border-left 0.15s',
                  alignItems: 'center',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => handleToggleSelect(transaction.transaction_id)}
                    style={{ width: '16px', height: '16px', cursor: 'pointer', accentColor: '#667eea' }}
                  />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    {transaction.userCategory && (
                      <span style={{
                        fontSize: '16px',
                        color: '#10b981',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }} title="Categorized">
                        ✓
                      </span>
                    )}
                    {searchQuery && transaction.name?.toLowerCase().includes(searchQuery.toLowerCase()) ? (
                      <>
                        {transaction.name.split(new RegExp(`(${searchQuery})`, 'gi')).map((part, idx) =>
                          part.toLowerCase() === searchQuery.toLowerCase() ? (
                            <mark key={idx} style={{ background: '#fef08a', padding: '0 2px' }}>{part}</mark>
                          ) : (
                            part
                          )
                        )}
                      </>
                    ) : (
                      transaction.name
                    )}
                  </div>
                  <div style={{ fontSize: '12px', color: '#6b7280' }}>
                    {transaction.userCategory || 'Uncategorized'}
                  </div>
                </div>
                <div style={{ fontSize: '14px', color: '#6b7280' }}>
                  {formatDate(transaction.date)}
                </div>
                <div style={{ fontSize: '14px', fontWeight: '500', textAlign: 'right' }}>
                  {formatCurrency(Math.abs(transaction.amount))}
                </div>
                <div className="transaction-actions-mobile-grid">
                  <div className="transaction-category-action">
                    <CategoryDropdown
                      transactionId={transaction.transaction_id}
                      currentCategory={transaction.userCategory}
                      onCategoryChange={(newCategory) => handleCategoryChange(transaction.transaction_id, newCategory)}
                      merchantName={transaction.merchant_name}
                      transactionName={transaction.name}
                      onBulkApply={handleBulkCategoryChange}
                      onBulkDialogOpen={onBulkDialogOpen}
                    />
                  </div>
                  <div className="transaction-other-actions">
                    <AddRuleButton
                      transactionName={transaction.name}
                      merchantName={transaction.merchant_name}
                      currentCategory={transaction.userCategory}
                      onCategoryChange={(newCategory) => handleCategoryChange(transaction.transaction_id, newCategory)}
                      transactionId={transaction.transaction_id}
                      transactionAmount={transaction.amount}
                      onRulesApplied={onRulesApplied || fetchUncategorized}
                    />
                    <TransactionNote
                      transactionId={transaction.transaction_id}
                      currentNote={transaction.userNote}
                      onNoteChange={(newNote) => handleNoteChange(transaction.transaction_id, newNote)}
                    />
                    <button
                      onClick={() => handleDeleteTransaction(
                        transaction.transaction_id,
                        transaction.name || transaction.merchant_name,
                        transaction.amount,
                        transaction.date
                      )}
                      disabled={loading}
                      className="transaction-delete-button"
                      style={{
                        padding: '4px 8px',
                        background: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '6px',
                        color: '#991b1b',
                        cursor: loading ? 'not-allowed' : 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '24px',
                        height: '24px',
                        opacity: loading ? 0.6 : 1,
                      }}
                      title="Delete this transaction permanently"
                    >
                      ×
                    </button>
                  </div>
                </div>
                <div className="transaction-delete-column" style={{ display: 'flex', gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
                  <button
                    onClick={() => handleDeleteTransaction(
                      transaction.transaction_id,
                      transaction.name || transaction.merchant_name,
                      transaction.amount,
                      transaction.date
                    )}
                    disabled={loading}
                    style={{
                      padding: '4px 8px',
                      background: '#fee2e2',
                      border: '1px solid #fecaca',
                      borderRadius: '6px',
                      color: '#991b1b',
                      cursor: loading ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: '600',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: '24px',
                      height: '24px',
                      opacity: loading ? 0.6 : 1,
                    }}
                    title="Delete this transaction permanently"
                  >
                    ×
                  </button>
                </div>
              </div>
              );
            })}
          </div>
          )}
        </div>
      )}
    </div>
  );
}
