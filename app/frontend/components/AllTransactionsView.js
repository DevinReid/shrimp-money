'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useAuth } from './auth/AuthContext';
import CategoryDropdown from './CategoryDropdown';
import AddRuleButton from './AddRuleButton';
import TransactionNote from './TransactionNote';

export default function AllTransactionsView({ onBulkDialogOpen, onRulesApplied, onDeleteTransaction: parentDeleteTransaction }) {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState('date'); // 'date', 'amount', 'name'
  const [sortOrder, setSortOrder] = useState('desc'); // 'asc', 'desc'
  const [importing, setImporting] = useState(false);
  const { token } = useAuth();

  const fetchAllTransactions = useCallback(async () => {
    if (!token) return;
    
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/plaid/transactions', {
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
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchAllTransactions();
  }, [fetchAllTransactions]);

  const handleCSVImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.csv')) {
      setError('Please select a CSV file');
      return;
    }

    try {
      setImporting(true);
      setError(null);

      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/plaid/transactions/import-csv', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
        body: formData,
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      // Refresh transactions after import
      await fetchAllTransactions();
      
      // Show success message
      alert(`Successfully imported ${data.count} transactions from ${data.dateRange.start} to ${data.dateRange.end}`);
      
      // Reset file input
      event.target.value = '';
    } catch (err) {
      console.error('Error importing CSV:', err);
      setError('Failed to import CSV file');
    } finally {
      setImporting(false);
    }
  };

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

  const handleCategoryChange = useCallback((transactionId, newCategory) => {
    // Update local state - only update if category actually changed
    setTransactions(prev => {
      const transaction = prev.find(t => t.transaction_id === transactionId);
      if (transaction?.userCategory === newCategory) return prev;
      
      return prev.map(t =>
        t.transaction_id === transactionId
          ? { ...t, userCategory: newCategory }
          : t
      );
    });
  }, []);

  const handleNoteChange = useCallback((transactionId, newNote) => {
    // Update local state when note changes
    setTransactions(prev => prev.map(t =>
      t.transaction_id === transactionId
        ? { ...t, userNote: newNote || null }
        : t
    ));
  }, []);

  // Use parent's delete handler if provided, otherwise use local one
  const handleDeleteTransaction = useCallback(async (transactionId, transactionName, amount, date) => {
    if (parentDeleteTransaction) {
      // Use parent's handler which will update parent state
      await parentDeleteTransaction(transactionId, transactionName, amount, date);
      // Also remove from local state
      setTransactions(prev => prev.filter(t => t.transaction_id !== transactionId));
    } else {
      // Fallback to local handler (for backwards compatibility)
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
          // Remove from local state immediately
          setTransactions(prev => prev.filter(t => t.transaction_id !== transactionId));
          console.log('✅ Transaction deleted successfully');
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
  }, [parentDeleteTransaction, token, formatCurrency, formatDate]);

  // Filter and sort transactions
  const filteredAndSortedTransactions = useMemo(() => {
    let filtered = transactions;

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = transactions.filter(t => 
        t.name?.toLowerCase().includes(query) ||
        t.userCategory?.toLowerCase().includes(query) ||
        t.merchant_name?.toLowerCase().includes(query)
      );
    }

    // Apply sorting
    const sorted = [...filtered].sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'date':
          comparison = new Date(a.date) - new Date(b.date);
          break;
        case 'amount':
          comparison = Math.abs(a.amount) - Math.abs(b.amount);
          break;
        case 'name':
          comparison = (a.name || '').localeCompare(b.name || '');
          break;
        default:
          comparison = 0;
      }
      
      return sortOrder === 'asc' ? comparison : -comparison;
    });

    return sorted;
  }, [transactions, searchQuery, sortBy, sortOrder]);

  if (loading && transactions.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading transactions...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px 0', width: 'calc(100% + 40px)', margin: '0 -20px', boxSizing: 'border-box' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
          All Transactions
          {transactions.length > 0 && (
            <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#6b7280', marginLeft: '10px' }}>
              ({filteredAndSortedTransactions.length} of {transactions.length})
            </span>
          )}
        </h2>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label
            style={{
              padding: '10px 20px',
              background: importing ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: importing ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'inline-block',
            }}
          >
            {importing ? '⏳ Importing...' : '📄 Import CSV'}
            <input
              type="file"
              accept=".csv"
              onChange={handleCSVImport}
              disabled={importing}
              style={{ display: 'none' }}
            />
          </label>
          <button
            onClick={fetchAllTransactions}
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#9ca3af' : '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {loading ? 'Refreshing...' : '🔄 Refresh'}
          </button>
        </div>
      </div>

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

      {/* Search and Sort Controls */}
      <div style={{
        display: 'flex',
        gap: '15px',
        marginBottom: '20px',
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <div style={{ flex: '1', minWidth: '250px' }}>
          <input
            type="text"
            placeholder="Search by merchant, category, or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 15px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
            }}
          />
        </div>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <label style={{ fontSize: '14px', color: '#6b7280' }}>Sort by:</label>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              cursor: 'pointer',
            }}
          >
            <option value="date">Date</option>
            <option value="amount">Amount</option>
            <option value="name">Name</option>
          </select>
          <button
            onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
            style={{
              padding: '8px 12px',
              background: '#f3f4f6',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
            }}
            title={sortOrder === 'asc' ? 'Ascending' : 'Descending'}
          >
            {sortOrder === 'asc' ? '↑' : '↓'}
          </button>
        </div>
      </div>

      {transactions.length === 0 ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ color: '#6b7280', fontSize: '18px', marginBottom: '10px' }}>
            No transactions found
          </p>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Connect your bank account to see transactions here.
          </p>
        </div>
      ) : filteredAndSortedTransactions.length === 0 ? (
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
            Try adjusting your search query.
          </p>
        </div>
      ) : (
        <div style={{
          background: 'white',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
          overflow: 'hidden',
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1.5fr 0.8fr 0.8fr 1.3fr auto',
            gap: '8px',
            padding: '12px 10px',
            background: '#f9fafb',
            borderBottom: '1px solid #e5e7eb',
            fontWeight: '600',
            fontSize: '14px',
            color: '#6b7280',
            position: 'sticky',
            top: 0,
            zIndex: 10,
          }}>
            <div>Merchant / Description</div>
            <div>Date</div>
            <div style={{ textAlign: 'right' }}>Amount</div>
            <div>Category</div>
            <div style={{ textAlign: 'center' }}>Actions</div>
          </div>
          <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
            {filteredAndSortedTransactions.map((transaction, index) => (
              <div
                key={transaction.transaction_id}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1.5fr 0.8fr 0.8fr 1.3fr auto',
                  gap: '8px',
                  padding: '12px 10px',
                  borderBottom: index < filteredAndSortedTransactions.length - 1 ? '1px solid #e5e7eb' : 'none',
                  background: !transaction.userCategory ? '#fef2f2' : index % 2 === 0 ? 'white' : '#f9fafb',
                  borderLeft: !transaction.userCategory ? '3px solid #ef4444' : 'none',
                }}
              >
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
                    {transaction.name}
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
                      onRulesApplied={onRulesApplied || fetchAllTransactions}
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
                <div className="transaction-delete-column" style={{ gap: '4px', alignItems: 'center', justifyContent: 'center' }}>
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
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

