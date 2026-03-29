'use client';

import { useEffect, useState, useCallback, useMemo, memo } from 'react';
import { createPortal } from 'react-dom';
import { usePlaidLink } from 'react-plaid-link';
import { useAuth } from './auth/AuthContext';
import { useSearchParams, useRouter } from 'next/navigation';
import RecurringPaymentsView from './RecurringPaymentsView';
import UncategorizedTransactionsView from './UncategorizedTransactionsView';
import AllTransactionsView from './AllTransactionsView';
import VendorRulesView from './VendorRulesView';
import SpendingForecastView from './SpendingForecastView';
import SpendingAnalysisView from './SpendingAnalysisView';
import CategoryDropdown from './CategoryDropdown';
import AddRuleButton from './AddRuleButton';
import BulkCategoryDialog from './BulkCategoryDialog';
import TransactionNote from './TransactionNote';
import '../app/page.css';

export default function PlaidApp() {
  const [linkToken, setLinkToken] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [uncategorizedCount, setUncategorizedCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview', 'recurring', 'uncategorized', 'all-transactions', 'vendor-rules', or 'options'
  const [menuOpen, setMenuOpen] = useState(false);
  const { token, logout, user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Define fetch functions first (they're used in onSuccess)
  const fetchAccounts = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const url = forceRefresh 
        ? '/api/plaid/accounts?refresh=true'
        : '/api/plaid/accounts';
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.accounts) {
        setAccounts(data);
        if (data.cached) {
          console.log('📦 Loaded accounts from cache');
        } else {
          console.log('🔄 Fetched fresh accounts from Plaid');
        }
      } else if (data.error) {
        // Handle error object or string
        const errorMsg = typeof data.error === 'object' 
          ? data.error.error_message || data.error.error_code || 'Unknown error'
          : data.error;
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Error fetching accounts:', err);
      setError('Failed to fetch accounts');
    } finally {
      setLoading(false);
    }
  };

  const fetchTransactions = async (forceRefresh = false) => {
    try {
      setLoading(true);
      const url = forceRefresh 
        ? '/api/plaid/transactions?refresh=true'
        : '/api/plaid/transactions';
      const response = await fetch(url, {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.transactions) {
        setTransactions(data);
        if (data.cached) {
          console.log('📦 Loaded transactions from cache');
        } else {
          console.log('🔄 Fetched fresh transactions from Plaid');
        }
      } else if (data.error) {
        // Handle error object or string
        const errorMsg = typeof data.error === 'object' 
          ? data.error.error_message || data.error.error_code || 'Unknown error'
          : data.error;
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Error fetching transactions:', err);
      setError('Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };



  // Handle successful Plaid Link connection
  const onSuccess = useCallback(async (publicToken, metadata) => {
    setLoading(true);
    setError(null);

    try {
      // Exchange public token for access token
      const exchangeResponse = await fetch('/api/plaid/exchange_public_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ public_token: publicToken }),
      });

      const exchangeData = await exchangeResponse.json();

      if (exchangeData.success) {
        setAccessToken(exchangeData.item_id);
        // Don't auto-fetch - user can click refresh if they want fresh data
        // Just try to load from cache
        await fetchAccounts(false); // false = cache only
        await fetchTransactions(false); // false = cache only
      } else {
        // Handle error object or string
        const errorMsg = exchangeData.error && typeof exchangeData.error === 'object'
          ? exchangeData.error.error_message || exchangeData.error.error_code || 'Unknown error'
          : exchangeData.error || 'Failed to exchange public token';
        setError(errorMsg);
      }
    } catch (err) {
      console.error('Error exchanging token:', err);
      setError('Failed to complete account linking');
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initialize usePlaidLink BEFORE useEffect that uses ready/open
  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  // Check for existing Plaid connection on mount
  useEffect(() => {
    if (!token) {
      return;
    }

    const checkExistingConnection = async () => {
      try {
        const response = await fetch('/api/plaid/connection-status', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });
        const data = await response.json();
        
        if (data.connected && data.item_id) {
          console.log('✅ Found existing Plaid connection:', data.item_id);
          setAccessToken(data.item_id);
          // Load cached data from database (no Plaid API calls)
          await fetchAccounts(false); // false = use cache only
          await fetchTransactions(false); // false = use cache only
        } else {
          console.log('ℹ️ No existing Plaid connection found');
        }
      } catch (err) {
        console.error('Error checking connection status:', err);
        // Don't set error here, just log it - user can still connect manually
      }
    };

    checkExistingConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Only run when token changes

  // Generate link token on component mount or when OAuth state changes
  useEffect(() => {
    if (!token) {
      console.log('🔐 No token available, skipping link token generation');
      return;
    }

    // Only generate link token if we don't have an access token
    // (user might want to reconnect or add another account)
    if (accessToken) {
      console.log('✅ Already connected, skipping link token generation');
      return;
    }

    // Don't regenerate if we already have a link token (unless OAuth state changed)
    const oauthStateId = searchParams.get('oauth_state_id');
    if (linkToken && !oauthStateId) {
      console.log('🔗 Link token already exists, skipping regeneration');
      return;
    }

    console.log('🔗 Generating link token...', { oauthStateId: oauthStateId || 'none' });

    const generateToken = async () => {
      try {
        setLoading(true);
        const requestBody = oauthStateId ? { oauth_state_id: oauthStateId } : {};
        
        console.log('📤 Requesting link token from API...');
        const response = await fetch('/api/plaid/create_link_token', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        });
        
        console.log('📥 Link token response status:', response.status);
        const data = await response.json();
        console.log('📥 Link token response data:', { 
          hasLinkToken: !!data.link_token, 
          hasError: !!data.error,
          error: data.error 
        });
        
        if (data.link_token) {
          console.log('✅ Link token received successfully');
          setLinkToken(data.link_token);
          setError(null);
          // If we have an OAuth state ID, automatically open Plaid Link
          // Note: ready and open will be checked in a separate effect
          if (oauthStateId) {
            console.log('🔄 OAuth flow detected, will open Plaid Link when ready...');
            // Clean up URL first
            router.replace('/');
          }
        } else if (data.error) {
          // Handle error object or string
          const errorMsg = typeof data.error === 'object' 
            ? data.error.error_message || data.error.error_code || 'Unknown error'
            : data.error;
          
          console.error('❌ Link token error:', errorMsg);
          
          if (errorMsg === 'MFA verification required' || data.requiresMFA) {
            setError('Please complete MFA verification to continue.');
          } else {
            setError(errorMsg || 'Failed to create link token. Check your .env file.');
          }
        } else {
          console.error('❌ No link token and no error in response');
          setError('Failed to create link token. Check your .env file.');
        }
      } catch (err) {
        console.error('❌ Error generating link token:', err);
        setError('Failed to connect to server. Make sure the backend is running.');
      } finally {
        setLoading(false);
      }
    };

    generateToken();
  }, [token, searchParams, router]); // Removed ready and open to prevent infinite loop

  // Handle OAuth auto-open separately when ready
  useEffect(() => {
    const oauthStateId = searchParams.get('oauth_state_id');
    if (oauthStateId && linkToken && ready && open) {
      console.log('🔄 OAuth flow: Opening Plaid Link...');
      // Small delay to ensure state is updated
      setTimeout(() => {
        open();
      }, 100);
    }
  }, [linkToken, ready, open, searchParams]);

  // Handle OAuth errors from redirect
  useEffect(() => {
    const oauthError = searchParams.get('oauth_error');
    const oauthErrorMessage = searchParams.get('error_message');

    if (oauthError) {
      setError(oauthErrorMessage || 'OAuth authentication failed. Please try again.');
      // Clean up URL
      router.replace('/');
    }
  }, [searchParams, router]);

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

  // Memoize sorted transactions to avoid re-sorting on every render
  // Filter to last 30 days for Overview tab
  const sortedTransactions = useMemo(() => {
    if (!transactions?.transactions) return [];
    
    // If we're on the overview tab, filter to last 30 days
    if (activeTab === 'overview') {
      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      
      return [...transactions.transactions]
        .filter(t => new Date(t.date) >= thirtyDaysAgo)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    // For other tabs, show all transactions
    return [...transactions.transactions].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [transactions?.transactions, activeTab]);

  // Fetch uncategorized count from the uncategorized endpoint to ensure accuracy
  // This matches exactly what the UncategorizedTransactionsView shows
  const fetchUncategorizedCount = useCallback(async () => {
    if (!token) return;
    
    try {
      const response = await fetch('/api/plaid/transactions/uncategorized', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.total !== undefined) {
        setUncategorizedCount(data.total);
      } else if (data.transactions) {
        setUncategorizedCount(data.transactions.length);
      } else {
        setUncategorizedCount(0);
      }
    } catch (err) {
      console.error('Error fetching uncategorized count:', err);
      setUncategorizedCount(0);
    }
  }, [token]);

  // Fetch uncategorized count when transactions are loaded or refreshed
  useEffect(() => {
    if (transactions?.transactions && token) {
      fetchUncategorizedCount();
    }
  }, [transactions, token, fetchUncategorizedCount]);

  // Optimize category change handler with useCallback
  const handleCategoryChange = useCallback((transactionId, newCategory) => {
    setTransactions(prev => {
      if (!prev?.transactions) return prev;
      // Only update if the category actually changed
      const transaction = prev.transactions.find(t => t.transaction_id === transactionId);
      if (transaction?.userCategory === newCategory) return prev;
      
      return {
        ...prev,
        transactions: prev.transactions.map(t =>
          t.transaction_id === transactionId
            ? { ...t, userCategory: newCategory }
            : t
        ),
      };
    });
  }, []);

  // Handler for note changes
  const handleNoteChange = useCallback((transactionId, newNote) => {
    setTransactions(prev => {
      if (!prev?.transactions) return prev;
      return {
        ...prev,
        transactions: prev.transactions.map(t =>
          t.transaction_id === transactionId
            ? { ...t, userNote: newNote || null }
            : t
        ),
      };
    });
  }, []);


  // State to trigger refresh in UncategorizedTransactionsView
  const [uncategorizedRefreshTrigger, setUncategorizedRefreshTrigger] = useState(0);

  // Callback to refresh transactions after rules are applied
  const handleRulesApplied = useCallback(() => {
    console.log('🔄 Rules applied, refreshing transactions...');
    fetchTransactions(false); // Refresh from cache/database
    fetchUncategorizedCount(); // Refresh uncategorized count
    // Trigger refresh in UncategorizedTransactionsView
    setUncategorizedRefreshTrigger(prev => prev + 1);
  }, [fetchUncategorizedCount]);

  // Handler to delete a transaction
  const handleDeleteTransaction = useCallback(async (transactionId, transactionName, amount, date) => {
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
        setTransactions(prev => {
          if (!prev?.transactions) return prev;
          return {
            ...prev,
            transactions: prev.transactions.filter(t => t.transaction_id !== transactionId),
            total_transactions: (prev.total_transactions || prev.transactions.length) - 1,
          };
        });
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
  }, [token]);

  // State for bulk categorization dialog - moved to parent to persist across re-renders
  const [bulkDialogState, setBulkDialogState] = useState({
    isOpen: false,
    transactionId: null,
    merchantName: null,
    transactionName: null,
    category: null,
  });

  // Handler to open bulk dialog from CategoryDropdown
  const handleBulkDialogOpen = useCallback((dialogData) => {
    setBulkDialogState({
      isOpen: true,
      transactionId: dialogData.transactionId,
      merchantName: dialogData.merchantName,
      transactionName: dialogData.transactionName,
      category: dialogData.category,
    });
  }, []);

  // Handler to close bulk dialog
  const handleBulkDialogClose = useCallback(() => {
    setBulkDialogState({
      isOpen: false,
      transactionId: null,
      merchantName: null,
      transactionName: null,
      category: null,
    });
  }, []);

  // Memoized transaction item component to prevent unnecessary re-renders
  const TransactionItem = memo(({ transaction, onCategoryChange, onRulesApplied, onBulkDialogOpen, onDeleteTransaction, onNoteChange }) => {
    // Create a stable callback for this specific transaction
    const handleCategoryChangeForTransaction = useCallback((newCategory) => {
      onCategoryChange(transaction.transaction_id, newCategory);
    }, [transaction.transaction_id, onCategoryChange]);
    
    // Create a stable callback to open bulk dialog for this transaction
    const handleBulkDialogOpenForTransaction = useCallback((dialogData) => {
      onBulkDialogOpen(dialogData);
    }, [onBulkDialogOpen]);

    // Create a stable callback for note changes
    const handleNoteChangeForTransaction = useCallback((newNote) => {
      onNoteChange(transaction.transaction_id, newNote);
    }, [transaction.transaction_id, onNoteChange]);

    return (
      <div 
        className="transaction-item"
        style={{
          background: !transaction.userCategory ? '#fef2f2' : '#f8f9fa',
          borderLeft: !transaction.userCategory ? '3px solid #ef4444' : '1px solid #e9ecef',
        }}
      >
        <div className="transaction-main">
          <div className="transaction-name">{transaction.name}</div>
          <div className="transaction-date">
            {formatDate(transaction.date)}
          </div>
        </div>
        <div style={{ marginBottom: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {transaction.userCategory && (
                <span style={{ 
                  fontSize: '18px', 
                  color: '#10b981',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }} title="Categorized">
                  ✓
                </span>
              )}
              <div className="transaction-amount">
                {formatCurrency(Math.abs(transaction.amount))}
              </div>
            </div>
            <div className="transaction-actions-mobile">
              <AddRuleButton
                transactionName={transaction.name}
                merchantName={transaction.merchant_name}
                currentCategory={transaction.userCategory}
                onCategoryChange={handleCategoryChangeForTransaction}
                transactionId={transaction.transaction_id}
                transactionAmount={transaction.amount}
                onRulesApplied={onRulesApplied}
              />
              <TransactionNote
                transactionId={transaction.transaction_id}
                currentNote={transaction.userNote}
                onNoteChange={handleNoteChangeForTransaction}
              />
              <button
                onClick={() => onDeleteTransaction(
                  transaction.transaction_id,
                  transaction.name || transaction.merchant_name,
                  transaction.amount,
                  transaction.date
                )}
                style={{
                  padding: '4px 8px',
                  background: '#fee2e2',
                  border: '1px solid #fecaca',
                  borderRadius: '6px',
                  color: '#991b1b',
                  cursor: 'pointer',
                  fontSize: '14px',
                  fontWeight: '600',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '24px',
                  height: '24px',
                }}
                title="Delete this transaction permanently"
              >
                ×
              </button>
            </div>
          </div>
          <div className="transaction-category-action-mobile">
            <CategoryDropdown
              transactionId={transaction.transaction_id}
              currentCategory={transaction.userCategory}
              onCategoryChange={handleCategoryChangeForTransaction}
              merchantName={transaction.merchant_name}
              transactionName={transaction.name}
              onBulkDialogOpen={handleBulkDialogOpenForTransaction}
            />
          </div>
        </div>
        <div className="transaction-category" style={{ fontSize: '11px', color: '#6b7280' }}>
          {transaction.userCategory || 'Uncategorized'}
        </div>
      </div>
    );
  }, (prevProps, nextProps) => {
    // Custom comparison to prevent unnecessary re-renders
    return (
      prevProps.transaction.transaction_id === nextProps.transaction.transaction_id &&
      prevProps.transaction.userCategory === nextProps.transaction.userCategory &&
      prevProps.transaction.userNote === nextProps.transaction.userNote &&
      prevProps.transaction.name === nextProps.transaction.name &&
      prevProps.transaction.amount === nextProps.transaction.amount &&
      prevProps.transaction.date === nextProps.transaction.date
    );
  });
  
  TransactionItem.displayName = 'TransactionItem';

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <button 
            className="hamburger-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle menu"
          >
            <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
            <span className={`hamburger-line ${menuOpen ? 'open' : ''}`}></span>
          </button>
          <div className="header-title">
            <h1>Shrimp Money</h1>
            <p>Your money, but make it shrimpy 🦐💜</p>
          </div>
        </div>
        
        {/* Hamburger Menu - Always rendered for quick loading - Rendered via portal to ensure it's on top */}
        {typeof window !== 'undefined' && createPortal(
          <>
            <div className={`hamburger-menu ${menuOpen ? 'open' : ''}`}>
              <div className="menu-content">
                {user && (
                  <div className="menu-user-info">
                    <span className="menu-user-text">
                      Logged in as: <strong>{user.username}</strong>
                    </span>
                  </div>
                )}
                
                {accessToken && (
                  <nav className="menu-tabs">
                    <button
                      onClick={() => {
                        setActiveTab('overview');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'overview' ? 'active' : ''}`}
                    >
                      Overview
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('recurring');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'recurring' ? 'active' : ''}`}
                    >
                      Recurring Payments
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('forecast');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'forecast' ? 'active' : ''}`}
                    >
                      🔮 Forecast
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('spending');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'spending' ? 'active' : ''}`}
                    >
                      📊 Spending Analysis
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('uncategorized');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'uncategorized' ? 'active' : ''} ${uncategorizedCount > 0 ? 'has-uncategorized' : ''}`}
                      style={{ position: 'relative' }}
                    >
                      Uncategorized
                      {uncategorizedCount > 0 && (
                        <span className="menu-tab-badge" style={{
                          position: 'absolute',
                          top: '8px',
                          right: '12px',
                          background: '#ef4444',
                          color: 'white',
                          borderRadius: '10px',
                          padding: '2px 6px',
                          fontSize: '11px',
                          fontWeight: '600',
                          minWidth: '18px',
                          textAlign: 'center',
                          boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                        }}>
                          {uncategorizedCount}
                        </span>
                      )}
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('all-transactions');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'all-transactions' ? 'active' : ''}`}
                    >
                      All Transactions
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('vendor-rules');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'vendor-rules' ? 'active' : ''}`}
                    >
                      ⚙️ Vendor Rules
                    </button>
                    <button
                      onClick={() => {
                        setActiveTab('options');
                        setMenuOpen(false);
                      }}
                      className={`menu-tab ${activeTab === 'options' ? 'active' : ''}`}
                    >
                      ⚙️ Options
                    </button>
                  </nav>
                )}
                
                <button 
                  onClick={() => {
                    setMenuOpen(false);
                    logout();
                  }} 
                  className="menu-logout-button"
                >
                  Logout
                </button>
              </div>
            </div>
            
            {/* Overlay to close menu when clicking outside - Always rendered */}
            <div 
              className={`menu-overlay ${menuOpen ? 'visible' : ''}`}
              onClick={() => setMenuOpen(false)}
            ></div>
          </>,
          document.body
        )}
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!accessToken && (
          <div className="link-section">
            <div style={{ marginBottom: '20px', padding: '20px', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
              <h3 style={{ margin: '0 0 10px 0', fontSize: '18px', fontWeight: '600' }}>Connect Your Bank Account</h3>
              <p style={{ margin: '0 0 15px 0', color: '#6b7280', fontSize: '14px' }}>
                Connect your bank account once and it will stay connected. You won't need to reconnect on future visits or when running automated tasks.
              </p>
              <button
                onClick={() => open()}
                disabled={!ready || loading}
                className="link-button"
              >
                {loading ? 'Loading...' : 'Connect Bank Account'}
              </button>
            </div>
            {process.env.NODE_ENV === 'development' && (
              <div className="sandbox-info">
                <strong>⚠️ IMPORTANT - Sandbox Mode:</strong>
                <br /><br />
                <strong>You MUST use these test credentials (NOT your real bank credentials):</strong>
                <br />
                <strong>Username:</strong> <code>user_good</code>
                <br />
                <strong>Password:</strong> <code>pass_good</code>
                <br />
                <strong>2FA Code (if asked):</strong> <code>1234</code>
                <br />
                <strong>Phone Number (if asked):</strong> Use any format like <code>4155551234</code> or <code>+14155551234</code>
                <br /><br />
                <em>If you see a phone number validation error, you're likely using real credentials. 
                In Sandbox mode, you must use the test credentials above.</em>
              </div>
            )}
          </div>
        )}

        {accessToken && (
          <>
            <div
              ref={(el) => {
                if (el) {
                  const updateScrollIndicators = () => {
                    const { scrollLeft, scrollWidth, clientWidth } = el;
                    el.classList.toggle('scrollable-left', scrollLeft > 0);
                    el.classList.toggle('scrollable-right', scrollLeft < scrollWidth - clientWidth - 1);
                  };
                  el.addEventListener('scroll', updateScrollIndicators);
                  updateScrollIndicators();
                }
              }}
              style={{
                display: 'flex',
                gap: '0',
                marginBottom: '0',
                overflowX: 'auto',
                WebkitOverflowScrolling: 'touch',
                scrollbarWidth: 'none',
                msOverflowStyle: 'none',
                touchAction: 'pan-x',
              }} 
              className="tabs-container desktop-tabs"
            >
              <button
                onClick={() => setActiveTab('overview')}
                className={`tab-button ${activeTab === 'overview' ? 'active' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('recurring')}
                className={`tab-button ${activeTab === 'recurring' ? 'active' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                Recurring Payments
              </button>
              <button
                onClick={() => setActiveTab('forecast')}
                className={`tab-button ${activeTab === 'forecast' ? 'active' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                🔮 Forecast
              </button>
              <button
                onClick={() => setActiveTab('spending')}
                className={`tab-button ${activeTab === 'spending' ? 'active' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                📊 Spending
              </button>
              <button
                onClick={() => setActiveTab('uncategorized')}
                className={`tab-button ${activeTab === 'uncategorized' ? 'active' : ''} ${uncategorizedCount > 0 ? 'has-uncategorized' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                  position: 'relative',
                }}
              >
                Uncategorized
                {uncategorizedCount > 0 && (
                  <span className="tab-badge" style={{
                    position: 'absolute',
                    top: '-4px',
                    right: '-4px',
                    background: '#ef4444',
                    color: 'white',
                    borderRadius: '10px',
                    padding: '2px 6px',
                    fontSize: '11px',
                    fontWeight: '600',
                    minWidth: '18px',
                    textAlign: 'center',
                    boxShadow: '0 2px 4px rgba(0, 0, 0, 0.2)',
                  }}>
                    {uncategorizedCount}
                  </span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('all-transactions')}
                className={`tab-button ${activeTab === 'all-transactions' ? 'active' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                All Transactions
              </button>
              <button
                onClick={() => setActiveTab('vendor-rules')}
                className={`tab-button ${activeTab === 'vendor-rules' ? 'active' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                ⚙️ Vendor Rules
              </button>
              <button
                onClick={() => setActiveTab('options')}
                className={`tab-button ${activeTab === 'options' ? 'active' : ''}`}
                style={{
                  touchAction: 'manipulation',
                  WebkitTapHighlightColor: 'transparent',
                }}
              >
                ⚙️ Options
              </button>
            </div>
            
            <div className="data-section">
            {activeTab === 'overview' && (
              <>
                {loading && <div className="loading">Loading...</div>}

                {uncategorizedCount > 0 && (
                  <div className="uncategorized-warning" style={{
                    background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
                    border: '2px solid #fecaca',
                    borderRadius: '12px',
                    padding: '16px 20px',
                    marginBottom: '24px',
                    color: '#991b1b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    boxShadow: '0 4px 12px rgba(239, 68, 68, 0.15)',
                  }}>
                    <span style={{ fontSize: '24px' }}>⚠️</span>
                    <div style={{ flex: 1 }}>
                      <strong style={{ fontSize: '16px', display: 'block', marginBottom: '4px' }}>
                        You have {uncategorizedCount} uncategorized transaction{uncategorizedCount !== 1 ? 's' : ''}
                      </strong>
                      <span style={{ fontSize: '14px', opacity: 0.9 }}>
                        Visit the <strong>Uncategorized</strong> tab to categorize them.
                      </span>
                    </div>
                    <button
                      onClick={() => setActiveTab('uncategorized')}
                      style={{
                        padding: '8px 16px',
                        background: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '8px',
                        cursor: 'pointer',
                        fontSize: '14px',
                        fontWeight: '600',
                        whiteSpace: 'nowrap',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={(e) => {
                        e.target.style.background = '#dc2626';
                        e.target.style.transform = 'translateY(-1px)';
                      }}
                      onMouseLeave={(e) => {
                        e.target.style.background = '#ef4444';
                        e.target.style.transform = 'translateY(0)';
                      }}
                    >
                      View Now
                    </button>
                  </div>
                )}

                {accounts && accounts.accounts && (
                  <section className="accounts-section">
                    <h2>Account Balances</h2>
                    <div className="accounts-grid">
                      {accounts.accounts.map((account) => (
                        <div key={account.account_id} className="account-card">
                          <h3>{account.name}</h3>
                          <p className="account-type">
                            {account.type} - {account.subtype}
                          </p>
                          <p className="account-mask">****{account.mask}</p>
                          <div className="balance">
                            <div className="balance-label">Available</div>
                            <div className="balance-amount">
                              {formatCurrency(account.balances.available || 0)}
                            </div>
                          </div>
                          <div className="balance">
                            <div className="balance-label">Current</div>
                            <div className="balance-amount">
                              {formatCurrency(account.balances.current || 0)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </section>
                )}

                {transactions && transactions.transactions && (
                  <section className="transactions-section">
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                      <h2 style={{ margin: 0 }}>
                        Transactions
                        {transactions.total_transactions > 100 && (
                          <span style={{ fontSize: '14px', fontWeight: 'normal', color: '#6b7280', marginLeft: '10px' }}>
                            ({transactions.total_transactions} total - showing all)
                          </span>
                        )}
                      </h2>
                      {transactions.total_transactions > 100 && (
                        <div style={{ fontSize: '12px', color: '#6b7280', padding: '6px 12px', background: '#f3f4f6', borderRadius: '6px' }}>
                          Large dataset - scroll to see all
                        </div>
                      )}
                    </div>
                    <div className="transactions-list" style={{ maxHeight: transactions.total_transactions > 50 ? '600px' : 'none', overflowY: transactions.total_transactions > 50 ? 'auto' : 'visible' }}>
                      {sortedTransactions.map((transaction) => (
                        <TransactionItem
                          key={transaction.transaction_id}
                          transaction={transaction}
                          onCategoryChange={handleCategoryChange}
                          onRulesApplied={handleRulesApplied}
                          onBulkDialogOpen={handleBulkDialogOpen}
                          onDeleteTransaction={handleDeleteTransaction}
                          onNoteChange={handleNoteChange}
                        />
                      ))}
                    </div>
                    <p className="transaction-count">
                      Showing {sortedTransactions.length} of {transactions.total_transactions || transactions.transactions.length} transactions (last 30 days)
                    </p>
                  </section>
                )}
              </>
            )}

            {activeTab === 'recurring' && (
              <RecurringPaymentsView />
            )}

            {activeTab === 'forecast' && (
              <SpendingForecastView />
            )}

            {activeTab === 'spending' && (
              <SpendingAnalysisView />
            )}

            {activeTab === 'uncategorized' && (
              <UncategorizedTransactionsView 
                refreshTrigger={uncategorizedRefreshTrigger}
                onBulkDialogOpen={handleBulkDialogOpen}
                onRulesApplied={handleRulesApplied}
                onDeleteTransaction={handleDeleteTransaction}
              />
            )}

            {activeTab === 'all-transactions' && (
              <AllTransactionsView 
                onBulkDialogOpen={handleBulkDialogOpen}
                onRulesApplied={handleRulesApplied}
                onDeleteTransaction={handleDeleteTransaction}
              />
            )}

            {activeTab === 'vendor-rules' && (
              <VendorRulesView />
            )}

            {activeTab === 'options' && (
              <div className="options-section">
                <h2 className="options-title">
                  ⚙️ Options
                </h2>
                
                <div className="options-card">
                  <h3 className="options-card-title">
                    Bank Account Connection
                  </h3>
                  
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '1rem',
                    background: 'linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)',
                    border: '2px solid #86efac',
                    borderRadius: '12px',
                    marginBottom: '1rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '20px' }}>✅</span>
                      <span style={{ fontSize: '14px', color: '#166534', fontWeight: '500' }}>
                        Bank account connected
                      </span>
                    </div>
                    <button
                      onClick={async () => {
                        if (confirm('Are you sure you want to disconnect? You can reconnect anytime.')) {
                          setAccessToken(null);
                          setAccounts(null);
                          setTransactions(null);
                          setActiveTab('overview');
                          // Note: We're not deleting the stored item here, just clearing the UI state
                          // The item will be overwritten on next connection
                        }
                      }}
                      className="disconnect-button"
                    >
                      Disconnect
                    </button>
                  </div>

                  <div className="action-buttons">
                    <button onClick={() => fetchAccounts(true)} disabled={loading} className="action-button">
                      {loading ? 'Refreshing...' : '🔄 Refresh Accounts from Plaid'}
                    </button>
                    <button onClick={() => fetchTransactions(true)} disabled={loading} className="action-button">
                      {loading ? 'Refreshing...' : '🔄 Refresh Transactions (30 Days)'}
                    </button>
                  </div>
                </div>
              </div>
            )}
            </div>
          </>
        )}
        
        {/* Bulk Category Dialog - Rendered at parent level to persist across re-renders */}
        <BulkCategoryDialog
          isOpen={bulkDialogState.isOpen}
          onClose={handleBulkDialogClose}
          transactionId={bulkDialogState.transactionId}
          merchantName={bulkDialogState.merchantName}
          transactionName={bulkDialogState.transactionName}
          category={bulkDialogState.category}
          onBulkApply={handleRulesApplied}
          onRulesApplied={handleRulesApplied}
        />
      </main>
    </div>
  );
}

