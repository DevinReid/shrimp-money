'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';

export default function SubscriptionsView() {
  const [subscriptions, setSubscriptions] = useState([]);
  const [predictions, setPredictions] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const { token } = useAuth();

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/plaid/subscriptions?prediction_days=30`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        }
      );

      const data = await response.json();

      if (data.error) {
        const errorMsg = typeof data.error === 'object'
          ? data.error.error_message || data.error.error_code || 'Unknown error'
          : data.error;
        setError(errorMsg);
        return;
      }

      if (data.success) {
        setSubscriptions(data.subscriptions || []);
        setPredictions(data.predictions || null);
        setAnalysis(data.analysis || null);
      }
    } catch (err) {
      console.error('Error fetching subscriptions:', err);
      setError('Failed to analyze subscriptions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchSubscriptions(); // Try cached data first
    }
  }, [token]);

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

  const getConfidenceColor = (confidence) => {
    if (confidence >= 80) return '#10b981'; // green
    if (confidence >= 60) return '#f59e0b'; // yellow
    return '#ef4444'; // red
  };

  const getFrequencyBadgeColor = (frequency) => {
    const colors = {
      monthly: '#667eea',
      'bi-weekly': '#8b5cf6',
      weekly: '#ec4899',
      quarterly: '#f59e0b',
      yearly: '#10b981',
    };
    return colors[frequency] || '#6b7280';
  };

  if (loading && subscriptions.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Analyzing your transactions for subscriptions...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>Subscriptions & Recurring Payments</h2>
        <button
          onClick={() => fetchSubscriptions()}
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

      {analysis && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          marginBottom: '30px',
        }}>
          <div style={{
            padding: '20px',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '5px' }}>Total Subscriptions</div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: '#111827' }}>
              {analysis.subscriptionCount}
            </div>
          </div>
          <div style={{
            padding: '20px',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '5px' }}>Monthly Total</div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: '#111827' }}>
              {formatCurrency(analysis.totalMonthlySubscriptions)}
            </div>
          </div>
          <div style={{
            padding: '20px',
            background: '#f9fafb',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '5px' }}>Transactions Analyzed</div>
            <div style={{ fontSize: '28px', fontWeight: '600', color: '#111827' }}>
              {analysis.totalTransactions.toLocaleString()}
            </div>
          </div>
        </div>
      )}

      {predictions && (
        <div style={{
          padding: '20px',
          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
          borderRadius: '8px',
          color: 'white',
          marginBottom: '30px',
        }}>
          <h3 style={{ margin: '0 0 15px 0', fontSize: '18px', fontWeight: '600' }}>
            Required Balance (Next 30 Days)
          </h3>
          <div style={{ fontSize: '36px', fontWeight: '700', marginBottom: '10px' }}>
            {formatCurrency(predictions.peakRequirement)}
          </div>
          <div style={{ fontSize: '14px', opacity: 0.9 }}>
            Total upcoming payments: {formatCurrency(predictions.totalUpcoming)}
          </div>
        </div>
      )}

      {subscriptions.length === 0 && !loading ? (
        <div style={{
          padding: '40px',
          textAlign: 'center',
          background: '#f9fafb',
          borderRadius: '8px',
          border: '1px solid #e5e7eb',
        }}>
          <p style={{ color: '#6b7280', marginBottom: '15px' }}>
            No recurring subscriptions detected yet.
          </p>
          <p style={{ color: '#6b7280', fontSize: '14px' }}>
            Click "Refresh" to analyze your transactions.
          </p>
        </div>
      ) : (
        <div>
          <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Detected Subscriptions</h3>
          <div style={{ display: 'grid', gap: '15px' }}>
            {subscriptions.map((sub) => (
              <div
                key={sub.id}
                style={{
                  padding: '20px',
                  background: 'white',
                  borderRadius: '8px',
                  border: '1px solid #e5e7eb',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '15px' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                      <h4 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>{sub.merchant}</h4>
                      <span
                        style={{
                          padding: '4px 10px',
                          background: getFrequencyBadgeColor(sub.frequency),
                          color: 'white',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: '500',
                          textTransform: 'capitalize',
                        }}
                      >
                        {sub.frequency}
                      </span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '600', color: '#111827', marginBottom: '5px' }}>
                      {formatCurrency(sub.amount)}
                    </div>
                    <div style={{ fontSize: '14px', color: '#6b7280' }}>
                      {sub.occurrences} occurrence{sub.occurrences !== 1 ? 's' : ''} detected
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{
                      width: '60px',
                      height: '60px',
                      borderRadius: '50%',
                      background: `conic-gradient(${getConfidenceColor(sub.confidence)} 0% ${sub.confidence}%, #e5e7eb ${sub.confidence}% 100%)`,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      position: 'relative',
                    }}>
                      <div style={{
                        position: 'absolute',
                        width: '45px',
                        height: '45px',
                        borderRadius: '50%',
                        background: 'white',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '12px',
                        fontWeight: '600',
                        color: getConfidenceColor(sub.confidence),
                      }}>
                        {sub.confidence}%
                      </div>
                    </div>
                    <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '5px' }}>Confidence</div>
                  </div>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                  gap: '15px',
                  padding: '15px',
                  background: '#f9fafb',
                  borderRadius: '6px',
                  marginTop: '15px',
                }}>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '3px' }}>Last Payment</div>
                    <div style={{ fontSize: '14px', fontWeight: '500' }}>{formatDate(sub.lastPaymentDate)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '3px' }}>Next Payment</div>
                    <div style={{ fontSize: '14px', fontWeight: '500', color: '#667eea' }}>
                      {formatDate(sub.nextPaymentDate)}
                    </div>
                  </div>
                  {sub.category && sub.category.length > 0 && (
                    <div>
                      <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '3px' }}>Category</div>
                      <div style={{ fontSize: '14px', fontWeight: '500' }}>
                        {sub.category.join(' > ')}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {predictions && predictions.upcomingPayments.length > 0 && (
        <div style={{ marginTop: '40px' }}>
          <h3 style={{ marginBottom: '20px', fontSize: '20px', fontWeight: '600' }}>Upcoming Payments (Next 30 Days)</h3>
          <div style={{
            background: 'white',
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden',
          }}>
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr 1fr',
              gap: '15px',
              padding: '15px',
              background: '#f9fafb',
              borderBottom: '1px solid #e5e7eb',
              fontWeight: '600',
              fontSize: '14px',
              color: '#6b7280',
            }}>
              <div>Date</div>
              <div>Merchant</div>
              <div style={{ textAlign: 'right' }}>Amount</div>
            </div>
            {predictions.upcomingPayments.slice(0, 20).map((payment, index) => (
              <div
                key={`${payment.date}-${payment.subscriptionId}-${index}`}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr 1fr',
                  gap: '15px',
                  padding: '15px',
                  borderBottom: index < predictions.upcomingPayments.length - 1 ? '1px solid #e5e7eb' : 'none',
                }}
              >
                <div style={{ fontSize: '14px' }}>{formatDate(payment.date)}</div>
                <div style={{ fontSize: '14px' }}>{payment.merchant}</div>
                <div style={{ fontSize: '14px', fontWeight: '500', textAlign: 'right' }}>
                  {formatCurrency(payment.amount)}
                </div>
              </div>
            ))}
            {predictions.upcomingPayments.length > 20 && (
              <div style={{ padding: '15px', textAlign: 'center', color: '#6b7280', fontSize: '14px' }}>
                ... and {predictions.upcomingPayments.length - 20} more payments
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

