import React, { useEffect, useState, useCallback } from 'react';
import { usePlaidLink } from 'react-plaid-link';
import './App.css';

function App() {
  const [linkToken, setLinkToken] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [accounts, setAccounts] = useState(null);
  const [transactions, setTransactions] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Generate link token on component mount
  useEffect(() => {
    const generateToken = async () => {
      try {
        const response = await fetch('/api/create_link_token', {
          method: 'POST',
        });
        const data = await response.json();
        if (data.link_token) {
          setLinkToken(data.link_token);
        } else {
          setError('Failed to create link token. Check your .env file.');
        }
      } catch (err) {
        console.error('Error generating link token:', err);
        setError('Failed to connect to server. Make sure the backend is running.');
      }
    };

    generateToken();
  }, []);

  // Handle successful Plaid Link connection
  const onSuccess = useCallback(async (publicToken, metadata) => {
    setLoading(true);
    setError(null);

    try {
      // Exchange public token for access token
      const exchangeResponse = await fetch('/api/exchange_public_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
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
        setError('Failed to exchange public token');
      }
    } catch (err) {
      console.error('Error exchanging token:', err);
      setError('Failed to complete account linking');
    } finally {
      setLoading(false);
    }
  }, []);

  const { open, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
  });

  const fetchAccounts = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/accounts');
      const data = await response.json();
      if (data.accounts) {
        setAccounts(data);
      } else if (data.error) {
        setError(data.error);
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
      const response = await fetch('/api/transactions');
      const data = await response.json();
      if (data.transactions) {
        setTransactions(data);
      } else if (data.error) {
        setError(data.error);
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
    <div className="App">
      <header className="App-header">
        <h1>Plaid Connect</h1>
        <p>Connect your Capital One account to view balances and transactions</p>
      </header>

      <main className="App-main">
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

export default App;

