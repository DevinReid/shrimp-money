'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';

export default function BulkCategoryDialog({ 
  isOpen, 
  onClose, 
  transactionId, 
  merchantName, 
  transactionName,
  category,
  onBulkApply,
  onRulesApplied 
}) {
  const { token } = useAuth();
  const [matchingTransactions, setMatchingTransactions] = useState([]);
  const [selectedTransactionIds, setSelectedTransactionIds] = useState(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState(null);
  const [createRule, setCreateRule] = useState(false); // Create vendor rule - unchecked by default

  useEffect(() => {
    // Use merchantName if available, otherwise use transactionName
    const merchant = merchantName || transactionName;
    if (isOpen && transactionId && merchant) {
      fetchMatchingTransactions(merchant);
    } else {
      setMatchingTransactions([]);
      setSelectedTransactionIds(new Set());
      setError(null);
    }
  }, [isOpen, transactionId, merchantName, transactionName]);

  const fetchMatchingTransactions = async (merchant) => {
    setLoading(true);
    setError(null);
    const merchantToUse = merchant || merchantName || transactionName;
    try {
      const response = await fetch('/api/plaid/transactions/bulk-categorize', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          transactionId,
          merchantName: merchantToUse,
          action: 'preview', // Just get matching transactions
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      const transactions = data.transactions || [];
      setMatchingTransactions(transactions);
      // Pre-select all transactions by default
      setSelectedTransactionIds(new Set(transactions.map(t => t.transaction_id)));
    } catch (err) {
      console.error('Error fetching matching transactions:', err);
      setError('Failed to find matching transactions');
      setMatchingTransactions([]);
      setSelectedTransactionIds(new Set());
    } finally {
      setLoading(false);
    }
  };

  const handleToggleTransaction = (transactionId) => {
    setSelectedTransactionIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(transactionId)) {
        newSet.delete(transactionId);
      } else {
        newSet.add(transactionId);
      }
      return newSet;
    });
  };

  const handleSelectAll = () => {
    setSelectedTransactionIds(new Set(matchingTransactions.map(t => t.transaction_id)));
  };

  const handleSelectNone = () => {
    setSelectedTransactionIds(new Set());
  };

  const handleApply = async () => {
    const selectedIds = Array.from(selectedTransactionIds);
    if (selectedIds.length === 0 && !createRule) {
      setError('Please select at least one transaction to categorize or enable rule creation');
      return;
    }

    if (!category) return;

    setApplying(true);
    setError(null);
    const merchantToUse = merchantName || transactionName;
    
    try {
      // Apply bulk categorization if transactions selected
      if (selectedIds.length > 0) {
        const response = await fetch('/api/plaid/transactions/bulk-categorize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            transactionId,
            merchantName: merchantToUse,
            category,
            selectedTransactionIds: selectedIds,
            action: 'apply',
          }),
        });

        const data = await response.json();

        if (data.error) {
          setError(data.error);
          return;
        }

        // Notify parent component
        if (onBulkApply) {
          onBulkApply(data.count, data.transactionIds);
        }
      }

      // Create vendor rule if checkbox is checked
      if (createRule) {
        console.log('🔧 Creating vendor rule for all transactions');
        const ruleResponse = await fetch('/api/plaid/rules/from-transaction', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
          body: JSON.stringify({
            transactionName,
            merchantName,
            category,
            autoApply: true,
          }),
        });

        const ruleData = await ruleResponse.json();
        
        if (ruleData.success) {
          console.log(`✅ Created vendor rule: ${ruleData.message}`);
          
          // Apply the rule to all matching transactions immediately
          console.log('🔄 Applying rule to all matching transactions...');
          try {
            const applyResponse = await fetch('/api/plaid/rules/apply', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`,
              },
            });

            const applyData = await applyResponse.json();
            
            if (applyData.success) {
              console.log(`✅ Applied rule to ${applyData.applied} transaction(s)`);
              
              // Notify parent to refresh transactions
              if (onRulesApplied) {
                onRulesApplied();
              }
            } else {
              console.warn('⚠️ Rule created but could not be applied:', applyData.error);
            }
          } catch (applyErr) {
            console.error('❌ Error applying rule:', applyErr);
            // Don't fail the whole operation, rule was still created
          }
        } else if (ruleData.error) {
          console.error('❌ Could not create vendor rule:', ruleData.error);
          // Don't fail the whole operation just because rule creation failed
        }
      }

      onClose();
    } catch (err) {
      console.error('Error applying bulk category:', err);
      setError('Failed to apply category to matching transactions');
    } finally {
      setApplying(false);
    }
  };

  if (!isOpen) return null;

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
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
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '20px',
      }}
      // Removed onClick={onClose} - dialog should only close via explicit button clicks
    >
      <div
        style={{
          background: 'white',
          borderRadius: '12px',
          maxWidth: '600px',
          width: '100%',
          maxHeight: '80vh',
          display: 'flex',
          flexDirection: 'column',
          boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
          zIndex: 100000,
          position: 'relative',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            padding: '20px',
            borderBottom: '1px solid #e5e7eb',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111827' }}>
              Category Saved
            </h3>
            <button
              onClick={onClose}
              disabled={applying}
              style={{
                background: 'transparent',
                border: 'none',
                fontSize: '24px',
                color: '#6b7280',
                cursor: applying ? 'not-allowed' : 'pointer',
                padding: '0',
                width: '28px',
                height: '28px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: '4px',
              }}
              onMouseEnter={(e) => e.target.style.background = '#f3f4f6'}
              onMouseLeave={(e) => e.target.style.background = 'transparent'}
            >
              ×
            </button>
          </div>
          <p style={{ margin: '8px 0 0 0', fontSize: '13px', color: '#059669' }}>
            This transaction has been categorized as "<strong>{category}</strong>".
            {matchingTransactions.length > 0
              ? ' Want to apply it to similar transactions too?'
              : ''}
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {matchingTransactions.length > 0 && (
            <p style={{ margin: '0 0 16px 0', color: '#6b7280', fontSize: '14px' }}>
              Found <strong>{matchingTransactions.length}</strong> similar uncategorized transaction{matchingTransactions.length !== 1 ? 's' : ''}. Select which should also be categorized as "<strong>{category}</strong>":
            </p>
          )}

          {matchingTransactions.length > 0 && (
            <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
              <button
                onClick={handleSelectAll}
                style={{
                  padding: '6px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: '#374151',
                }}
              >
                Select All ({matchingTransactions.length})
              </button>
              <button
                onClick={handleSelectNone}
                style={{
                  padding: '6px 12px',
                  background: '#f3f4f6',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '12px',
                  fontWeight: '500',
                  color: '#374151',
                }}
              >
                Select None
              </button>
              <span style={{ fontSize: '12px', color: '#6b7280', lineHeight: '32px' }}>
                {selectedTransactionIds.size} selected
              </span>
            </div>
          )}

          {error && (
            <div style={{
              padding: '12px',
              background: '#fee2e2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              color: '#991b1b',
              marginBottom: '16px',
              fontSize: '14px',
            }}>
              <strong>Error:</strong> {error}
            </div>
          )}

          {loading ? (
            <div style={{ textAlign: 'center', padding: '40px', color: '#6b7280' }}>
              <p>Searching for matching transactions...</p>
            </div>
          ) : matchingTransactions.length > 0 ? (
            <div style={{
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              overflow: 'hidden',
              maxHeight: '300px',
              overflowY: 'auto',
            }}>
              <div style={{
                padding: '12px',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                display: 'grid',
                gridTemplateColumns: 'auto 2fr 1fr 1fr auto',
                gap: '12px',
                fontSize: '12px',
                fontWeight: '600',
                color: '#6b7280',
                alignItems: 'center',
              }}>
                <div></div>
                <div>Description</div>
                <div>Date</div>
                <div style={{ textAlign: 'right' }}>Amount</div>
                <div style={{ textAlign: 'right', fontSize: '10px' }}>Match</div>
              </div>
              {matchingTransactions.map((transaction, index) => {
                const isSelected = selectedTransactionIds.has(transaction.transaction_id);
                const matchScore = transaction.matchScore || 0;
                const matchReason = transaction.matchReason || 'unknown';
                
                return (
                  <div
                    key={transaction.transaction_id}
                    onClick={() => handleToggleTransaction(transaction.transaction_id)}
                    style={{
                      padding: '12px',
                      borderBottom: index < matchingTransactions.length - 1 ? '1px solid #e5e7eb' : 'none',
                      display: 'grid',
                      gridTemplateColumns: 'auto 2fr 1fr 1fr auto',
                      gap: '12px',
                      fontSize: '13px',
                      background: isSelected 
                        ? (index % 2 === 0 ? '#eff6ff' : '#dbeafe')
                        : (index % 2 === 0 ? 'white' : '#f9fafb'),
                      cursor: 'pointer',
                      alignItems: 'center',
                      borderLeft: isSelected ? '3px solid #3b82f6' : '3px solid transparent',
                    }}
                    onMouseEnter={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = index % 2 === 0 ? '#f3f4f6' : '#f9fafb';
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!isSelected) {
                        e.currentTarget.style.background = index % 2 === 0 ? 'white' : '#f9fafb';
                      }
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => handleToggleTransaction(transaction.transaction_id)}
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        width: '18px',
                        height: '18px',
                        cursor: 'pointer',
                      }}
                    />
                    <div style={{ color: '#111827' }}>
                      {transaction.name || transaction.merchant_name}
                    </div>
                    <div style={{ color: '#6b7280' }}>
                      {formatDate(transaction.date)}
                    </div>
                    <div style={{ textAlign: 'right', color: '#111827', fontWeight: '500' }}>
                      {formatCurrency(transaction.amount)}
                    </div>
                    <div style={{ textAlign: 'right', fontSize: '10px', color: '#6b7280' }}>
                      {matchScore >= 0.9 && '🎯'}
                      {matchScore >= 0.75 && matchScore < 0.9 && '✓'}
                      {matchScore < 0.75 && '~'}
                      <span style={{ marginLeft: '4px' }}>
                        {Math.round(matchScore * 100)}%
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '8px',
              color: '#6b7280',
            }}>
              <p>No other uncategorized transactions found from this merchant.</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '20px',
            borderTop: '1px solid #e5e7eb',
          }}
        >
          {/* Create Rule Checkbox */}
          <div style={{
            marginBottom: '16px',
            padding: '12px',
            background: createRule ? '#f0fdf4' : '#f9fafb',
            border: createRule ? '1px solid #86efac' : '1px solid #e5e7eb',
            borderRadius: '8px',
          }}>
            <label style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '10px',
              cursor: 'pointer',
            }}>
              <input
                type="checkbox"
                checked={createRule}
                onChange={(e) => setCreateRule(e.target.checked)}
                style={{
                  width: '18px',
                  height: '18px',
                  marginTop: '2px',
                  cursor: 'pointer',
                }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '500', fontSize: '14px', color: '#111827' }}>
                  ⚙️ Create vendor rule for future transactions
                </div>
                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                  New transactions from "{merchantName || transactionName}" will automatically be categorized as "{category}"
                </div>
              </div>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              onClick={onClose}
              disabled={applying}
              style={{
                padding: '10px 20px',
                background: (selectedTransactionIds.size === 0 && !createRule) ? '#10b981' : '#f3f4f6',
                color: (selectedTransactionIds.size === 0 && !createRule) ? 'white' : '#374151',
                border: 'none',
                borderRadius: '6px',
                cursor: applying ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              {(selectedTransactionIds.size === 0 && !createRule) ? 'Done' : 'Skip'}
            </button>
            {(selectedTransactionIds.size > 0 || createRule) && (
              <button
                onClick={handleApply}
                disabled={applying || loading || !category}
                style={{
                  padding: '10px 20px',
                  background: applying || loading ? '#9ca3af' : '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: applying || loading ? 'not-allowed' : 'pointer',
                  fontSize: '14px',
                  fontWeight: '500',
                }}
              >
                {applying ? 'Applying...' : (
                  selectedTransactionIds.size > 0
                    ? `Apply to ${selectedTransactionIds.size} Similar${createRule ? ' + Create Rule' : ''}`
                    : 'Create Rule Only'
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

