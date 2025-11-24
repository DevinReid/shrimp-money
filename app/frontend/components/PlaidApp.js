'use client';

import { useEffect, useState, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import { useAuth } from './auth/AuthContext';
import { useSearchParams, useRouter } from 'next/navigation';
import '../app/page.css';

export default function PlaidApp() {
  const [linkToken, setLinkToken] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { token, logout, user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Generate link token on component mount or when OAuth state changes
  useEffect(() => {
    if (!token) {
      console.log('🔐 No token available, skipping link token generation');
      return;
    }

    const oauthStateId = searchParams.get('oauth_state_id');
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
          if (oauthStateId && ready) {
            console.log('🔄 OAuth flow detected, opening Plaid Link...');
            // Clean up URL first
            router.replace('/');
            // Small delay to ensure state is updated
            setTimeout(() => open(), 100);
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
  }, [token, searchParams, ready, open, router]);

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
        // Automatically fetch accounts and transactions
        await fetchAccounts();
        await fetchTransactions();
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

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

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

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/plaid/accounts', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.accounts) {
        setAccounts(data);
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

  const fetchTransactions = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/plaid/transactions', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.transactions) {
        setTransactions(data);
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

  return (
    <div className="app">
      <header className="app-header">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
          <div>
            <h1>Bank Account Manager</h1>
            <p>Connect your bank account to view balances and transactions</p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            {user && (
              <span style={{ color: '#333', fontSize: '14px' }}>
                Logged in as: <strong>{user.username}</strong>
              </span>
            )}
            <button 
              onClick={logout} 
              style={{
                padding: '8px 16px',
                background: 'rgba(102, 126, 234, 0.1)',
                border: '1px solid rgba(102, 126, 234, 0.3)',
                borderRadius: '6px',
                color: '#667eea',
                cursor: 'pointer',
                fontSize: '14px',
              }}
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        {error && (
          <div className="error-message">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!accessToken && (
          <div className="link-section">
            <button
              onClick={() => open()}
              disabled={!ready || loading}
              className="link-button"
            >
              {loading ? 'Loading...' : 'Launch Plaid Link'}
            </button>
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
          </div>
        )}

        {accessToken && (
          <div className="data-section">
            <div className="action-buttons">
              <button onClick={fetchAccounts} disabled={loading} className="action-button">
                Refresh Accounts
              </button>
              <button onClick={fetchTransactions} disabled={loading} className="action-button">
                Refresh Transactions
              </button>
            </div>

            {loading && <div className="loading">Loading...</div>}

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
                <h2>Recent Transactions (Last 30 Days)</h2>
                <div className="transactions-list">
                  {transactions.transactions.map((transaction) => (
                    <div key={transaction.transaction_id} className="transaction-item">
                      <div className="transaction-main">
                        <div className="transaction-name">{transaction.name}</div>
                        <div className="transaction-date">
                          {formatDate(transaction.date)}
                        </div>
                      </div>
                      <div className="transaction-amount">
                        {formatCurrency(Math.abs(transaction.amount))}
                      </div>
                      <div className="transaction-category">
                        {transaction.category?.join(' / ') || 'Uncategorized'}
                      </div>
                    </div>
                  ))}
                </div>
                <p className="transaction-count">
                  Total: {transactions.transactions.length} transactions
                </p>
              </section>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

