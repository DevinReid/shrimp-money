'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';

const RECURRING_CATEGORIES = ['Income', 'Subscription', 'Bill', 'Credit Card'];
const FREQUENCIES = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'bi-weekly', label: 'Bi-weekly' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'quarterly', label: 'Quarterly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'custom', label: 'Custom' },
];

export default function RecurringPaymentsView() {
  const [recurringPayments, setRecurringPayments] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [upcomingPayments, setUpcomingPayments] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview'); // overview, calendar, manage
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingPayment, setEditingPayment] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [linkToExistingModal, setLinkToExistingModal] = useState(null); // Stores suggestion being linked
  const { token } = useAuth();

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    merchantName: '',
    category: 'Bill',
    amount: '',
    frequency: 'monthly',
    frequencyDays: '',
    dayOfMonth: '',
    startDate: '',
    lastPaymentDate: '',
    notes: '',
  });

  const fetchRecurringPayments = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await fetch('/api/plaid/recurring-payments', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      if (data.success) {
        setRecurringPayments(data.recurringPayments || []);
        setSuggestions(data.suggestions || []);
        setUpcomingPayments(data.upcomingPayments || []);
        setSummary(data.summary || null);
      }
    } catch (err) {
      console.error('Error fetching recurring payments:', err);
      setError('Failed to fetch recurring payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchRecurringPayments();
    }
  }, [token]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(Math.abs(amount));
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getCategoryColor = (category) => {
    const colors = {
      'Income': '#10b981',
      'Subscription': '#667eea',
      'Bill': '#f59e0b',
      'Credit Card': '#ef4444',
    };
    return colors[category] || '#6b7280';
  };

  const getFrequencyLabel = (frequency) => {
    const freq = FREQUENCIES.find(f => f.value === frequency);
    return freq ? freq.label : frequency;
  };

  const resetForm = () => {
    setFormData({
      name: '',
      merchantName: '',
      category: 'Bill',
      amount: '',
      frequency: 'monthly',
      frequencyDays: '',
      dayOfMonth: '',
      startDate: '',
      lastPaymentDate: '',
      notes: '',
    });
    setEditingPayment(null);
    setShowAddForm(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingPayment 
        ? `/api/plaid/recurring-payments/${editingPayment.id}`
        : '/api/plaid/recurring-payments';
      
      const response = await fetch(url, {
        method: editingPayment ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...formData,
          amount: parseFloat(formData.amount),
          frequencyDays: formData.frequency === 'custom' ? parseInt(formData.frequencyDays) : null,
          dayOfMonth: formData.dayOfMonth ? parseInt(formData.dayOfMonth) : null,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      resetForm();
      fetchRecurringPayments();
    } catch (err) {
      console.error('Error saving recurring payment:', err);
      setError('Failed to save recurring payment');
    }
  };

  const handleEdit = (payment) => {
    setFormData({
      name: payment.name || '',
      merchantName: payment.merchantName || '',
      category: payment.category || 'Bill',
      amount: payment.amount?.toString() || '',
      frequency: payment.frequency || 'monthly',
      frequencyDays: payment.frequencyDays?.toString() || '',
      dayOfMonth: payment.dayOfMonth?.toString() || '',
      startDate: payment.startDate ? payment.startDate.split('T')[0] : '',
      lastPaymentDate: payment.lastPaymentDate ? payment.lastPaymentDate.split('T')[0] : '',
      notes: payment.notes || '',
    });
    setEditingPayment(payment);
    setShowAddForm(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to remove this recurring payment?')) return;
    
    try {
      const response = await fetch(`/api/plaid/recurring-payments/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      fetchRecurringPayments();
    } catch (err) {
      console.error('Error deleting recurring payment:', err);
      setError('Failed to delete recurring payment');
    }
  };

  const handleAddFromSuggestion = (suggestion) => {
    setFormData({
      name: suggestion.merchant,
      merchantName: suggestion.merchant,
      category: suggestion.category,
      amount: suggestion.suggestedAmount.toString(),
      frequency: suggestion.suggestedFrequency,
      frequencyDays: '',
      dayOfMonth: '',
      startDate: '',
      lastPaymentDate: suggestion.lastDate ? suggestion.lastDate.split('T')[0] : '',
      notes: `Auto-detected from ${suggestion.occurrences} transactions`,
    });
    setShowAddForm(true);
  };

  const handleLinkToExisting = async (payment, suggestion) => {
    try {
      setLoading(true);
      const response = await fetch(`/api/plaid/recurring-payments/${payment.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          addAlias: suggestion.merchant,
        }),
      });

      const data = await response.json();

      if (data.error) {
        setError(data.error);
        return;
      }

      setLinkToExistingModal(null);
      fetchRecurringPayments(); // Refresh to remove from suggestions
    } catch (err) {
      console.error('Error linking suggestion:', err);
      setError('Failed to link suggestion to existing payment');
    } finally {
      setLoading(false);
    }
  };

  // Filter payments based on search
  const filteredPayments = recurringPayments.filter(p => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      p.name?.toLowerCase().includes(query) ||
      p.merchantName?.toLowerCase().includes(query) ||
      p.category?.toLowerCase().includes(query)
    );
  });

  // Group upcoming payments by date for calendar view
  const groupedUpcoming = upcomingPayments.reduce((acc, payment) => {
    if (!acc[payment.date]) {
      acc[payment.date] = [];
    }
    acc[payment.date].push(payment);
    return acc;
  }, {});

  if (loading && recurringPayments.length === 0) {
    return (
      <div style={{ padding: '20px', textAlign: 'center' }}>
        <p>Loading recurring payments...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600' }}>
          Recurring Payments & Bills
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setShowAddForm(true)}
            style={{
              padding: '10px 20px',
              background: '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            + Add Payment
          </button>
          <button
            onClick={fetchRecurringPayments}
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
            {loading ? 'Refreshing...' : 'Refresh'}
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
          <button onClick={() => setError(null)} style={{ float: 'right', background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
        </div>
      )}

      {/* Summary Cards */}
      {summary && (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '15px',
          marginBottom: '30px',
        }}>
          <div style={{
            padding: '20px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            borderRadius: '12px',
            color: 'white',
          }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '5px' }}>Monthly Income</div>
            <div style={{ fontSize: '28px', fontWeight: '700' }}>
              {formatCurrency(summary.totalMonthlyIncome)}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
              {summary.byCategory?.Income || 0} recurring
            </div>
          </div>
          
          <div style={{
            padding: '20px',
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            borderRadius: '12px',
            color: 'white',
          }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '5px' }}>Monthly Expenses</div>
            <div style={{ fontSize: '28px', fontWeight: '700' }}>
              {formatCurrency(summary.totalMonthlyExpenses)}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
              {(summary.byCategory?.Subscription || 0) + (summary.byCategory?.Bill || 0) + (summary.byCategory?.['Credit Card'] || 0)} recurring
            </div>
          </div>
          
          <div style={{
            padding: '20px',
            background: summary.netMonthly >= 0 
              ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
              : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            borderRadius: '12px',
            color: 'white',
          }}>
            <div style={{ fontSize: '14px', opacity: 0.9, marginBottom: '5px' }}>Net Monthly</div>
            <div style={{ fontSize: '28px', fontWeight: '700' }}>
              {summary.netMonthly >= 0 ? '+' : ''}{formatCurrency(summary.netMonthly)}
            </div>
            <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
              {summary.totalRecurring} total payments
            </div>
          </div>

          <div style={{
            padding: '20px',
            background: '#f9fafb',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
          }}>
            <div style={{ fontSize: '14px', color: '#6b7280', marginBottom: '10px' }}>By Category</div>
            {RECURRING_CATEGORIES.map(cat => (
              <div key={cat} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                <span style={{ fontSize: '13px', color: getCategoryColor(cat) }}>{cat}</span>
                <span style={{ fontSize: '13px', fontWeight: '600' }}>{summary.byCategory?.[cat] || 0}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '5px',
        marginBottom: '20px',
        borderBottom: '2px solid #e5e7eb',
        paddingBottom: '0',
      }}>
        {[
          { id: 'overview', label: 'Overview' },
          { id: 'calendar', label: 'Upcoming Calendar' },
          { id: 'manage', label: 'Manage Payments' },
          { id: 'suggestions', label: `Suggestions (${suggestions.length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '12px 20px',
              background: activeTab === tab.id ? '#667eea' : 'transparent',
              color: activeTab === tab.id ? 'white' : '#6b7280',
              border: 'none',
              borderRadius: '8px 8px 0 0',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              marginBottom: '-2px',
              borderBottom: activeTab === tab.id ? '2px solid #667eea' : '2px solid transparent',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Link to Existing Payment Modal */}
      {linkToExistingModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '80vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '20px' }}>
              Link to Existing Payment
            </h3>
            <p style={{ margin: '0 0 20px 0', color: '#6b7280', fontSize: '14px' }}>
              Add "<strong>{linkToExistingModal.merchant}</strong>" as an alias to an existing recurring payment.
              Future transactions with this name will be associated with the selected payment.
            </p>

            {recurringPayments.length === 0 ? (
              <div style={{
                padding: '20px',
                background: '#f9fafb',
                borderRadius: '8px',
                textAlign: 'center',
                color: '#6b7280',
              }}>
                No existing recurring payments to link to. Create one first!
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '10px', marginBottom: '20px' }}>
                {recurringPayments.map(payment => (
                  <div
                    key={payment.id}
                    onClick={() => handleLinkToExisting(payment, linkToExistingModal)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '15px',
                      background: '#f9fafb',
                      borderRadius: '8px',
                      border: '2px solid #e5e7eb',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                    onMouseOver={(e) => {
                      e.currentTarget.style.borderColor = '#667eea';
                      e.currentTarget.style.background = '#f0f4ff';
                    }}
                    onMouseOut={(e) => {
                      e.currentTarget.style.borderColor = '#e5e7eb';
                      e.currentTarget.style.background = '#f9fafb';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: getCategoryColor(payment.category),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '16px',
                        fontWeight: '600',
                      }}>
                        {payment.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '15px' }}>{payment.name}</div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {payment.category} • {formatCurrency(payment.amount)} / {getFrequencyLabel(payment.frequency)}
                        </div>
                        {payment.merchantAliases && payment.merchantAliases.length > 0 && (
                          <div style={{ fontSize: '11px', color: '#9ca3af', marginTop: '2px' }}>
                            Aliases: {payment.merchantAliases.join(', ')}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{
                      padding: '6px 12px',
                      background: '#667eea',
                      color: 'white',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}>
                      Link Here
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => setLinkToExistingModal(null)}
                style={{
                  padding: '10px 20px',
                  background: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Form Modal */}
      {showAddForm && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: 'white',
            borderRadius: '12px',
            padding: '30px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflowY: 'auto',
          }}>
            <h3 style={{ margin: '0 0 20px 0', fontSize: '20px' }}>
              {editingPayment ? 'Edit Recurring Payment' : 'Add Recurring Payment'}
            </h3>
            
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                  Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  required
                  placeholder="e.g., Netflix, Electric Bill"
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                />
              </div>

              <div style={{ marginBottom: '15px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                  Category *
                </label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                  }}
                >
                  {RECURRING_CATEGORIES.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                    Amount *
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    required
                    placeholder="0.00"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                    Frequency *
                  </label>
                  <select
                    value={formData.frequency}
                    onChange={(e) => setFormData({ ...formData, frequency: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  >
                    {FREQUENCIES.map(f => (
                      <option key={f.value} value={f.value}>{f.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {formData.frequency === 'custom' && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                    Days Between Payments
                  </label>
                  <input
                    type="number"
                    value={formData.frequencyDays}
                    onChange={(e) => setFormData({ ...formData, frequencyDays: e.target.value })}
                    placeholder="e.g., 45"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              )}

              {formData.frequency === 'monthly' && (
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                    Day of Month (optional)
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="31"
                    value={formData.dayOfMonth}
                    onChange={(e) => setFormData({ ...formData, dayOfMonth: e.target.value })}
                    placeholder="e.g., 15"
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              )}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px', marginBottom: '15px' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={formData.startDate}
                    onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                    Last Payment Date
                  </label>
                  <input
                    type="date"
                    value={formData.lastPaymentDate}
                    onChange={(e) => setFormData({ ...formData, lastPaymentDate: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '14px',
                    }}
                  />
                </div>
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', fontSize: '14px' }}>
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Optional notes..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '10px',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    fontSize: '14px',
                    resize: 'vertical',
                  }}
                />
              </div>

              <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={resetForm}
                  style={{
                    padding: '10px 20px',
                    background: '#f3f4f6',
                    color: '#374151',
                    border: '1px solid #d1d5db',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{
                    padding: '10px 20px',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                  }}
                >
                  {editingPayment ? 'Save Changes' : 'Add Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Overview Tab */}
      {activeTab === 'overview' && (
        <div>
          {/* Next 7 Days Preview */}
          <div style={{ marginBottom: '30px' }}>
            <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px' }}>Next 7 Days</h3>
            {upcomingPayments.filter(p => {
              const paymentDate = new Date(p.date);
              const today = new Date();
              const weekFromNow = new Date(today);
              weekFromNow.setDate(weekFromNow.getDate() + 7);
              return paymentDate >= today && paymentDate <= weekFromNow;
            }).length === 0 ? (
              <div style={{
                padding: '30px',
                background: '#f0fdf4',
                borderRadius: '8px',
                border: '1px solid #bbf7d0',
                textAlign: 'center',
                color: '#166534',
              }}>
                No payments due in the next 7 days
              </div>
            ) : (
              <div style={{
                display: 'grid',
                gap: '10px',
              }}>
                {upcomingPayments.filter(p => {
                  const paymentDate = new Date(p.date);
                  const today = new Date();
                  const weekFromNow = new Date(today);
                  weekFromNow.setDate(weekFromNow.getDate() + 7);
                  return paymentDate >= today && paymentDate <= weekFromNow;
                }).map((payment, idx) => (
                  <div
                    key={`${payment.recurringPaymentId}-${payment.date}-${idx}`}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '15px',
                      background: payment.isIncome ? '#f0fdf4' : '#fef2f2',
                      borderRadius: '8px',
                      border: `1px solid ${payment.isIncome ? '#bbf7d0' : '#fecaca'}`,
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '8px',
                        background: getCategoryColor(payment.category),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '16px',
                        fontWeight: '600',
                      }}>
                        {payment.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '15px' }}>{payment.name}</div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {formatDate(payment.date)} • {payment.category}
                        </div>
                      </div>
                    </div>
                    <div style={{
                      fontSize: '18px',
                      fontWeight: '600',
                      color: payment.isIncome ? '#10b981' : '#ef4444',
                    }}>
                      {payment.isIncome ? '+' : '-'}{formatCurrency(payment.amount)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* All Recurring Payments */}
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px' }}>All Recurring Payments</h3>
          {recurringPayments.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}>
              <p style={{ color: '#6b7280', marginBottom: '15px' }}>
                No recurring payments configured yet.
              </p>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                Add your first payment or check the Suggestions tab for auto-detected patterns.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {recurringPayments.map(payment => (
                <div
                  key={payment.id}
                  style={{
                    padding: '20px',
                    background: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ display: 'flex', gap: '15px' }}>
                      <div style={{
                        width: '50px',
                        height: '50px',
                        borderRadius: '10px',
                        background: getCategoryColor(payment.category),
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        color: 'white',
                        fontSize: '20px',
                        fontWeight: '600',
                      }}>
                        {payment.name?.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px' }}>
                          {payment.name}
                        </div>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <span style={{
                            padding: '3px 8px',
                            background: getCategoryColor(payment.category) + '20',
                            color: getCategoryColor(payment.category),
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '500',
                          }}>
                            {payment.category}
                          </span>
                          <span style={{
                            padding: '3px 8px',
                            background: '#f3f4f6',
                            color: '#6b7280',
                            borderRadius: '4px',
                            fontSize: '12px',
                          }}>
                            {getFrequencyLabel(payment.frequency)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{
                        fontSize: '22px',
                        fontWeight: '700',
                        color: payment.category === 'Income' ? '#10b981' : '#111827',
                      }}>
                        {payment.category === 'Income' ? '+' : ''}{formatCurrency(payment.amount)}
                      </div>
                      <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                        Next: {formatDate(payment.nextPaymentDate)}
                      </div>
                    </div>
                  </div>
                  
                  {payment.merchantAliases && payment.merchantAliases.length > 0 && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px',
                      background: '#f0f4ff',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: '#4b5563',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap',
                    }}>
                      <span style={{ fontWeight: '500', color: '#667eea' }}>🔗 Also matches:</span>
                      {payment.merchantAliases.map((alias, i) => (
                        <span key={i} style={{
                          padding: '2px 8px',
                          background: 'white',
                          borderRadius: '4px',
                          border: '1px solid #d1d5db',
                        }}>
                          {alias}
                        </span>
                      ))}
                    </div>
                  )}
                  
                  {payment.notes && (
                    <div style={{
                      marginTop: '12px',
                      padding: '10px',
                      background: '#f9fafb',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: '#6b7280',
                    }}>
                      {payment.notes}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Calendar Tab */}
      {activeTab === 'calendar' && (
        <div>
          <h3 style={{ fontSize: '18px', fontWeight: '600', marginBottom: '15px' }}>
            Upcoming Payments (Next 60 Days)
          </h3>
          
          {Object.keys(groupedUpcoming).length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}>
              <p style={{ color: '#6b7280' }}>
                No upcoming payments scheduled. Add some recurring payments to see them here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '20px' }}>
              {Object.entries(groupedUpcoming).map(([date, payments]) => {
                const totalExpenses = payments.filter(p => !p.isIncome).reduce((sum, p) => sum + p.amount, 0);
                const totalIncome = payments.filter(p => p.isIncome).reduce((sum, p) => sum + p.amount, 0);
                const dateObj = new Date(date);
                const isToday = new Date().toDateString() === dateObj.toDateString();
                
                return (
                  <div key={date} style={{
                    border: isToday ? '2px solid #667eea' : '1px solid #e5e7eb',
                    borderRadius: '8px',
                    overflow: 'hidden',
                    background: 'white',
                  }}>
                    <div style={{
                      padding: '12px 15px',
                      background: isToday ? '#667eea' : '#f9fafb',
                      borderBottom: '1px solid #e5e7eb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div>
                        <span style={{
                          fontWeight: '600',
                          fontSize: '15px',
                          color: isToday ? 'white' : '#111827',
                        }}>
                          {dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                        </span>
                        {isToday && (
                          <span style={{
                            marginLeft: '10px',
                            padding: '2px 8px',
                            background: 'rgba(255,255,255,0.2)',
                            borderRadius: '10px',
                            fontSize: '12px',
                            color: 'white',
                          }}>
                            Today
                          </span>
                        )}
                      </div>
                      <div style={{
                        fontSize: '14px',
                        color: isToday ? 'white' : '#6b7280',
                      }}>
                        {totalIncome > 0 && <span style={{ color: isToday ? '#bbf7d0' : '#10b981', marginRight: '10px' }}>+{formatCurrency(totalIncome)}</span>}
                        {totalExpenses > 0 && <span style={{ color: isToday ? '#fecaca' : '#ef4444' }}>-{formatCurrency(totalExpenses)}</span>}
                      </div>
                    </div>
                    <div>
                      {payments.map((payment, idx) => (
                        <div
                          key={`${payment.recurringPaymentId}-${idx}`}
                          style={{
                            padding: '12px 15px',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            borderBottom: idx < payments.length - 1 ? '1px solid #f3f4f6' : 'none',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <div style={{
                              width: '8px',
                              height: '8px',
                              borderRadius: '50%',
                              background: getCategoryColor(payment.category),
                            }} />
                            <span style={{ fontSize: '14px' }}>{payment.name}</span>
                            <span style={{
                              fontSize: '11px',
                              color: '#6b7280',
                              background: '#f3f4f6',
                              padding: '2px 6px',
                              borderRadius: '4px',
                            }}>
                              {payment.category}
                            </span>
                          </div>
                          <span style={{
                            fontWeight: '600',
                            color: payment.isIncome ? '#10b981' : '#111827',
                          }}>
                            {payment.isIncome ? '+' : ''}{formatCurrency(payment.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Manage Tab */}
      {activeTab === 'manage' && (
        <div>
          <div style={{ marginBottom: '20px' }}>
            <input
              type="text"
              placeholder="Search payments..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                maxWidth: '400px',
                padding: '10px 15px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: '14px',
              }}
            />
          </div>

          {filteredPayments.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}>
              <p style={{ color: '#6b7280' }}>
                {searchQuery ? 'No payments match your search.' : 'No recurring payments configured yet.'}
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
                gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
                gap: '15px',
                padding: '12px 15px',
                background: '#f9fafb',
                borderBottom: '1px solid #e5e7eb',
                fontWeight: '600',
                fontSize: '13px',
                color: '#6b7280',
              }}>
                <div>Name</div>
                <div>Category</div>
                <div>Amount</div>
                <div>Frequency</div>
                <div>Next Payment</div>
                <div>Actions</div>
              </div>
              {filteredPayments.map((payment, idx) => (
                <div
                  key={payment.id}
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '2fr 1fr 1fr 1fr 1fr auto',
                    gap: '15px',
                    padding: '12px 15px',
                    borderBottom: idx < filteredPayments.length - 1 ? '1px solid #f3f4f6' : 'none',
                    alignItems: 'center',
                  }}
                >
                  <div style={{ fontWeight: '500' }}>{payment.name}</div>
                  <div>
                    <span style={{
                      padding: '3px 8px',
                      background: getCategoryColor(payment.category) + '20',
                      color: getCategoryColor(payment.category),
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}>
                      {payment.category}
                    </span>
                  </div>
                  <div style={{ fontWeight: '600' }}>{formatCurrency(payment.amount)}</div>
                  <div style={{ color: '#6b7280', fontSize: '13px' }}>{getFrequencyLabel(payment.frequency)}</div>
                  <div style={{ fontSize: '13px' }}>{formatDate(payment.nextPaymentDate)}</div>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleEdit(payment)}
                      style={{
                        padding: '5px 10px',
                        background: '#f3f4f6',
                        border: '1px solid #d1d5db',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(payment.id)}
                      style={{
                        padding: '5px 10px',
                        background: '#fee2e2',
                        border: '1px solid #fecaca',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '12px',
                        color: '#991b1b',
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggestions Tab */}
      {activeTab === 'suggestions' && (
        <div>
          <div style={{
            padding: '15px',
            background: '#eff6ff',
            border: '1px solid #bfdbfe',
            borderRadius: '8px',
            marginBottom: '20px',
            fontSize: '14px',
            color: '#1e40af',
          }}>
            <strong>💡 Auto-Detection:</strong> These are recurring payments detected from your categorized transactions 
            (Income, Subscription, Bill, Credit Card).
            <br /><br />
            <strong>🦐 Tip:</strong> If you see the same payment with different names (like "Adobe Illustrator" and "Illustrator 2025"), 
            use <strong>"Link to Existing"</strong> to add it as an alias instead of creating a duplicate!
          </div>

          {suggestions.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              background: '#f9fafb',
              borderRadius: '8px',
              border: '1px solid #e5e7eb',
            }}>
              <p style={{ color: '#6b7280', marginBottom: '10px' }}>
                No suggestions available.
              </p>
              <p style={{ color: '#6b7280', fontSize: '14px' }}>
                Categorize more transactions as Income, Subscription, Bill, or Credit Card to see suggestions here.
              </p>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: '15px' }}>
              {suggestions.map((suggestion, idx) => (
                <div
                  key={idx}
                  style={{
                    padding: '20px',
                    background: 'white',
                    borderRadius: '8px',
                    border: '1px solid #e5e7eb',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '8px' }}>
                        {suggestion.merchant}
                      </div>
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
                        <span style={{
                          padding: '3px 8px',
                          background: getCategoryColor(suggestion.category) + '20',
                          color: getCategoryColor(suggestion.category),
                          borderRadius: '4px',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}>
                          {suggestion.category}
                        </span>
                        <span style={{ fontSize: '13px', color: '#6b7280' }}>
                          {suggestion.occurrences} transactions detected
                        </span>
                      </div>
                      <div style={{ fontSize: '14px', color: '#6b7280' }}>
                        Suggested: <strong>{formatCurrency(suggestion.suggestedAmount)}</strong> / {suggestion.suggestedFrequency}
                      </div>
                      <div style={{ fontSize: '13px', color: '#9ca3af', marginTop: '5px' }}>
                        Last seen: {formatDate(suggestion.lastDate)}
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <button
                        onClick={() => handleAddFromSuggestion(suggestion)}
                        style={{
                          padding: '8px 16px',
                          background: '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '13px',
                          fontWeight: '500',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        + Add New
                      </button>
                      {recurringPayments.length > 0 && (
                        <button
                          onClick={() => setLinkToExistingModal(suggestion)}
                          style={{
                            padding: '8px 16px',
                            background: '#667eea',
                            color: 'white',
                            border: 'none',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '500',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          🔗 Link to Existing
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

