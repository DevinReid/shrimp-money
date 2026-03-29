'use client';

import { useState, useEffect } from 'react';
import { useAuth } from './auth/AuthContext';
import CategoryColorPicker from './CategoryColorPicker';

// Default category colors (fallback)
const DEFAULT_CATEGORY_COLORS = {
  'Income': '#10b981',
  'Subscription': '#667eea',
  'Bill': '#f59e0b',
  'Credit Card': '#ef4444',
  'Food & Drink': '#ec4899',
  'Shopping': '#8b5cf6',
  'Transportation': '#06b6d4',
  'Entertainment': '#f97316',
  'Travel': '#14b8a6',
  'Health': '#22c55e',
  'Groceries': '#84cc16',
  'Utilities': '#eab308',
  'Insurance': '#6366f1',
  'Rent': '#a855f7',
  'Gas': '#0ea5e9',
  'Uncategorized': '#9ca3af',
};

export default function SpendingAnalysisView() {
  const [analysis, setAnalysis] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedYear, setSelectedYear] = useState('last12months'); // Default to last 12 months
  const [availableYears, setAvailableYears] = useState([]);
  const [expandedCategory, setExpandedCategory] = useState(null);
  const [viewMode, setViewMode] = useState('categories'); // 'categories', 'monthly', or 'byMonth'
  const [expandedMonth, setExpandedMonth] = useState(null); // For byMonth view: month index or null
  const [selectedCategoryInMonth, setSelectedCategoryInMonth] = useState(null); // { monthIndex: number, category: string } or null
  const [showAllCategories, setShowAllCategories] = useState(false);
  const [selectedCategoryForTransactions, setSelectedCategoryForTransactions] = useState(null);
  const [customColors, setCustomColors] = useState({});
  const [colorPickerOpen, setColorPickerOpen] = useState(null); // category name or null
  const [colorPickerPosition, setColorPickerPosition] = useState({ x: 0, y: 0 }); // click position
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(null); // month index (0-11) or null for all months
  const { token } = useAuth();

  // Get category color (custom or default)
  const getCategoryColor = (category) => {
    return customColors[category] || DEFAULT_CATEGORY_COLORS[category] || '#6b7280';
  };

  // Lighten a hex color (for selected month bars)
  const lightenColor = (hex, percent = 30) => {
    // Remove # if present
    hex = hex.replace('#', '');
    
    // Convert to RGB
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    
    // Lighten by adding white
    const lighten = (color) => Math.min(255, Math.round(color + (255 - color) * (percent / 100)));
    
    // Convert back to hex
    const toHex = (n) => {
      const hex = n.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    };
    
    return `#${toHex(lighten(r))}${toHex(lighten(g))}${toHex(lighten(b))}`;
  };

  const fetchAnalysis = async (year) => {
    try {
      setLoading(true);
      setError(null);
      
      // Store the requested year to preserve user's selection
      const requestedYear = year || selectedYear;
      
      const response = await fetch(`/api/plaid/spending-analysis?year=${requestedYear}`, {
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
        setAnalysis(data);
        if (data.availableYears?.length > 0) {
          // Update available years but DON'T reset the selection
          // The user's selection should be preserved unless there's an actual error
          setAvailableYears(data.availableYears);
        }
      }
    } catch (err) {
      console.error('Error fetching spending analysis:', err);
      setError('Failed to fetch spending analysis');
    } finally {
      setLoading(false);
    }
  };

  // Fetch custom colors
  const fetchCustomColors = async () => {
    try {
      const response = await fetch('/api/plaid/category-colors', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      const data = await response.json();
      if (data.success && data.colors) {
        setCustomColors(data.colors);
      }
    } catch (err) {
      console.error('Error fetching custom colors:', err);
    }
  };

  useEffect(() => {
    if (token) {
      fetchAnalysis(selectedYear);
      fetchCustomColors();
    }
  }, [token, selectedYear]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatCurrencyDetailed = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  if (loading && !analysis) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>📊</div>
        <p style={{ color: '#6b7280' }}>Crunching the numbers...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>📊</span> Spending Analysis
          </h2>
          <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: '14px' }}>
            {analysis?.isLast12Months 
              ? 'Your spending breakdown for the last 12 months'
              : `Your spending breakdown for ${analysis?.periodLabel || selectedYear}`
            }
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(e.target.value)}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'white',
            }}
          >
            {availableYears.length > 0 ? (
              availableYears.map(year => {
                // Ensure value is always a string for consistency
                const yearValue = String(year);
                if (year === 'last12months' || yearValue === 'last12months') {
                  return <option key={yearValue} value={yearValue}>Last 12 Months</option>;
                }
                return <option key={yearValue} value={yearValue}>{year}</option>;
              })
            ) : (
              <option value={selectedYear}>
                {selectedYear === 'last12months' ? 'Last 12 Months' : selectedYear}
              </option>
            )}
          </select>
          
          <div style={{
            display: 'flex',
            background: '#f3f4f6',
            borderRadius: '6px',
            padding: '2px',
          }}>
            <button
              onClick={() => {
                setViewMode('categories');
                setExpandedMonth(null);
              }}
              style={{
                padding: '6px 12px',
                background: viewMode === 'categories' ? 'white' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: viewMode === 'categories' ? '600' : '400',
                boxShadow: viewMode === 'categories' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              By Category
            </button>
            <button
              onClick={() => {
                setViewMode('byMonth');
                setExpandedCategory(null);
              }}
              style={{
                padding: '6px 12px',
                background: viewMode === 'byMonth' ? 'white' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: viewMode === 'byMonth' ? '600' : '400',
                boxShadow: viewMode === 'byMonth' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              By Month
            </button>
            <button
              onClick={() => {
                setViewMode('monthly');
                setExpandedMonth(null);
                setExpandedCategory(null);
              }}
              style={{
                padding: '6px 12px',
                background: viewMode === 'monthly' ? 'white' : 'transparent',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '13px',
                fontWeight: viewMode === 'monthly' ? '600' : '400',
                boxShadow: viewMode === 'monthly' ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              Budget Check
            </button>
          </div>
          
          <button
            onClick={() => fetchAnalysis(selectedYear)}
            disabled={loading}
            style={{
              padding: '8px 16px',
              background: loading ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            {loading ? 'Loading...' : '🔄 Refresh'}
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

      {analysis && (
        <>
          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: '15px',
            marginBottom: '30px',
          }}>
            <div style={{
              padding: '20px',
              background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>Total Spent</div>
              <div style={{ fontSize: '26px', fontWeight: '700' }}>
                {formatCurrency(analysis.summary.totalExpenses)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
                {analysis.summary.totalTransactions} transactions
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>Total Income</div>
              <div style={{ fontSize: '26px', fontWeight: '700' }}>
                {formatCurrency(analysis.summary.totalIncome)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
                {analysis.summary.monthsWithData} months of data
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>Avg Monthly Spend</div>
              <div style={{ fontSize: '26px', fontWeight: '700' }}>
                {formatCurrency(analysis.summary.avgMonthlyExpenses)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
                per month average
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              background: analysis.summary.netChange >= 0 
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>Net for Year</div>
              <div style={{ fontSize: '26px', fontWeight: '700' }}>
                {analysis.summary.netChange >= 0 ? '+' : ''}{formatCurrency(analysis.summary.netChange)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
                income - expenses
              </div>
            </div>
          </div>

          {/* Recent Months Snapshot */}
          {(() => {
            const monthsWithData = analysis.monthlySummary
              .map((m, i) => ({ ...m, originalIndex: i }))
              .filter(m => m.transactionCount > 0);
            const thisMonth = monthsWithData[monthsWithData.length - 1] || null;
            const lastMonth = monthsWithData[monthsWithData.length - 2] || null;
            if (!thisMonth) return null;

            const expenseChange = lastMonth && lastMonth.totalExpenses > 0
              ? ((thisMonth.totalExpenses - lastMonth.totalExpenses) / lastMonth.totalExpenses) * 100
              : null;

            return (
              <div style={{ marginBottom: '25px' }}>
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: lastMonth ? '1fr 1fr' : '1fr',
                  gap: '15px',
                  marginBottom: expenseChange !== null ? '12px' : '0',
                }}>
                  {/* This Month */}
                  <div style={{
                    padding: '20px',
                    background: 'white',
                    borderRadius: '12px',
                    border: '2px solid #3b82f6',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                      <div style={{ fontWeight: '700', fontSize: '16px', color: '#1f2937' }}>
                        {thisMonth.monthName}
                      </div>
                      <span style={{
                        padding: '2px 8px',
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                      }}>In Progress</span>
                    </div>
                    <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Spent</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#ef4444' }}>{formatCurrency(thisMonth.totalExpenses)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Income</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>{formatCurrency(thisMonth.totalIncome)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Net</div>
                        <div style={{ fontSize: '20px', fontWeight: '700', color: thisMonth.netChange >= 0 ? '#10b981' : '#ef4444' }}>
                          {thisMonth.netChange >= 0 ? '+' : ''}{formatCurrency(thisMonth.netChange)}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      {thisMonth.topCategories.slice(0, 3).map((cat, i) => (
                        <span key={i} style={{
                          padding: '3px 8px',
                          background: getCategoryColor(cat.category) + '20',
                          color: getCategoryColor(cat.category),
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: '500',
                        }}>
                          {cat.category}: {formatCurrency(cat.total)}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Last Month */}
                  {lastMonth && (
                    <div style={{
                      padding: '20px',
                      background: 'white',
                      borderRadius: '12px',
                      border: '1px solid #e5e7eb',
                    }}>
                      <div style={{ fontWeight: '700', fontSize: '16px', color: '#1f2937', marginBottom: '12px' }}>
                        {lastMonth.monthName}
                      </div>
                      <div style={{ display: 'flex', gap: '20px', marginBottom: '12px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Spent</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#ef4444' }}>{formatCurrency(lastMonth.totalExpenses)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Income</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: '#10b981' }}>{formatCurrency(lastMonth.totalIncome)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Net</div>
                          <div style={{ fontSize: '20px', fontWeight: '700', color: lastMonth.netChange >= 0 ? '#10b981' : '#ef4444' }}>
                            {lastMonth.netChange >= 0 ? '+' : ''}{formatCurrency(lastMonth.netChange)}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                        {lastMonth.topCategories.slice(0, 3).map((cat, i) => (
                          <span key={i} style={{
                            padding: '3px 8px',
                            background: getCategoryColor(cat.category) + '20',
                            color: getCategoryColor(cat.category),
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: '500',
                          }}>
                            {cat.category}: {formatCurrency(cat.total)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Change indicator */}
                {expenseChange !== null && (
                  <div style={{
                    padding: '10px 16px',
                    background: expenseChange <= 0 ? '#ecfdf5' : '#fef2f2',
                    border: `1px solid ${expenseChange <= 0 ? '#a7f3d0' : '#fecaca'}`,
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: '600',
                    color: expenseChange <= 0 ? '#065f46' : '#991b1b',
                    textAlign: 'center',
                  }}>
                    Spending {expenseChange <= 0 ? 'down' : 'up'} {Math.abs(Math.round(expenseChange))}% from {lastMonth.monthName}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Year Data Warning */}
          {analysis.summary.totalTransactions < 50 && (
            <div style={{
              padding: '16px 20px',
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '12px',
              marginBottom: '25px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
            }}>
              <span style={{ fontSize: '24px' }}>💡</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', color: '#92400e' }}>
                  Limited data for {analysis.isLast12Months ? 'Last 12 Months' : selectedYear}
                </div>
                <div style={{ color: '#a16207', fontSize: '14px' }}>
                  Only {analysis.summary.totalTransactions} transactions found. 
                  {availableYears.length > 1 && availableYears[1] !== 'last12months' && (
                    <span> Try selecting {availableYears[1]} for more complete data.</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Uncategorized Warning */}
          {(analysis.summary.allUncategorizedTransactions || analysis.summary.uncategorizedTransactions) > 0 && (
            <div style={{
              padding: '16px 20px',
              background: '#fef3c7',
              border: '1px solid #fcd34d',
              borderRadius: '12px',
              marginBottom: '25px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
            }}>
              <span style={{ fontSize: '24px' }}>⚠️</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: '600', color: '#92400e' }}>
                  {analysis.summary.allUncategorizedTransactions || analysis.summary.uncategorizedTransactions} uncategorized transactions
                </div>
                <div style={{ color: '#a16207', fontSize: '14px' }}>
                  totaling {formatCurrencyDetailed(analysis.summary.allUncategorizedTotal || analysis.summary.uncategorizedTotal)} — categorize them for better insights!
                </div>
              </div>
            </div>
          )}

          {/* Category View */}
          {viewMode === 'categories' && (
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '20px',
                borderBottom: '1px solid #e5e7eb',
                background: '#f9fafb',
              }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                  Spending by Category
                </h3>
                <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#6b7280' }}>
                  Click a category to see monthly breakdown
                </p>
              </div>
              
              <div>
                {analysis.categoryStats
                  .filter(cat => cat.isExpense || cat.category === 'Income' || cat.category === 'Transfer')
                  .map((cat, idx) => (
                  <div key={cat.category}>
                    {/* Category Row */}
                    <div
                      onClick={() => {
                        const newCategory = expandedCategory === cat.category ? null : cat.category;
                        setExpandedCategory(newCategory);
                        // Reset month filter when changing categories
                        if (newCategory !== cat.category) {
                          setSelectedMonthIndex(null);
                        }
                      }}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr auto auto auto',
                        gap: '20px',
                        alignItems: 'center',
                        padding: '16px 20px',
                        borderBottom: '1px solid #f3f4f6',
                        cursor: 'pointer',
                        background: expandedCategory === cat.category ? '#f9fafb' : 'white',
                        transition: 'background 0.2s',
                      }}
                      onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                      onMouseLeave={(e) => e.currentTarget.style.background = expandedCategory === cat.category ? '#f9fafb' : 'white'}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <div 
                          onClick={(e) => {
                            e.stopPropagation();
                            // Get click position relative to viewport
                            const rect = e.currentTarget.getBoundingClientRect();
                            setColorPickerPosition({
                              x: rect.left + rect.width / 2, // Center of the color square
                              y: rect.top + rect.height, // Below the color square
                            });
                            setColorPickerOpen(cat.category);
                          }}
                          style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '10px',
                            background: getCategoryColor(cat.category),
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'white',
                            fontSize: '14px',
                            fontWeight: '700',
                            cursor: 'pointer',
                            border: '2px solid transparent',
                            transition: 'all 0.2s',
                            position: 'relative',
                          }}
                          onMouseEnter={(e) => {
                            e.currentTarget.style.border = '2px solid rgba(0, 0, 0, 0.2)';
                            e.currentTarget.style.transform = 'scale(1.05)';
                          }}
                          onMouseLeave={(e) => {
                            e.currentTarget.style.border = '2px solid transparent';
                            e.currentTarget.style.transform = 'scale(1)';
                          }}
                          title="Click to change color"
                        >
                          {cat.category.charAt(0)}
                        </div>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontWeight: '600', fontSize: '15px' }}>{cat.category}</div>
                          <div style={{ fontSize: '12px', color: '#6b7280' }}>
                            {cat.transactionCount} transactions • {cat.monthsActive} months
                          </div>
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Monthly Avg</div>
                        <div style={{ fontWeight: '600', fontSize: '14px' }}>
                          {formatCurrency(cat.avgPerMonth)}
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>Range</div>
                        <div style={{ fontSize: '13px', color: '#6b7280' }}>
                          {formatCurrency(cat.minMonth)} - {formatCurrency(cat.maxMonth)}
                        </div>
                      </div>
                      
                      <div style={{ textAlign: 'right', minWidth: '100px' }}>
                        <div style={{ fontWeight: '700', fontSize: '18px' }}>
                          {formatCurrency(cat.yearTotal)}
                        </div>
                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                          {cat.percentOfTotal}% of {cat.category === 'Income' ? 'income' : 'total'}
                        </div>
                      </div>
                    </div>
                    
                    {/* Expanded Monthly Breakdown */}
                    {expandedCategory === cat.category && (() => {
                      // Filter transactions by selected month
                      const filteredTransactions = selectedMonthIndex !== null && cat.transactions
                        ? cat.transactions.filter(txn => {
                            const txnDate = new Date(txn.date);
                            return txnDate.getMonth() === selectedMonthIndex;
                          })
                        : cat.transactions;

                      return (
                        <div style={{
                          padding: '15px 20px 20px',
                          background: '#f9fafb',
                          borderBottom: '1px solid #e5e7eb',
                        }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '12px' }}>
                            Monthly Breakdown for {cat.category}
                            {selectedMonthIndex !== null && (
                              <span style={{ fontSize: '11px', fontWeight: '400', marginLeft: '8px', color: '#9ca3af' }}>
                                • Filtered to {analysis.monthlySummary[selectedMonthIndex]?.monthName}
                              </span>
                            )}
                          </div>
                          <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(12, 1fr)',
                            gap: '4px',
                          }}>
                            {analysis.monthlySummary.map((month, mIdx) => {
                              const amount = cat.monthlyBreakdown[mIdx];
                              const maxAmount = Math.max(...cat.monthlyBreakdown);
                              const barHeight = maxAmount > 0 ? (amount / maxAmount) * 60 : 0;
                              const isSelected = selectedMonthIndex === mIdx;
                              const baseColor = getCategoryColor(cat.category);
                              const barColor = isSelected 
                                ? lightenColor(baseColor, 40)
                                : (amount > 0 ? baseColor : '#e5e7eb');
                              
                              return (
                                <div 
                                  key={mIdx} 
                                  style={{ 
                                    textAlign: 'center',
                                    cursor: amount > 0 ? 'pointer' : 'default',
                                  }}
                                  onClick={() => {
                                    if (amount > 0) {
                                      // Toggle: if same month clicked, deselect; otherwise select new month
                                      setSelectedMonthIndex(isSelected ? null : mIdx);
                                    }
                                  }}
                                  onMouseEnter={(e) => {
                                    if (amount > 0) {
                                      e.currentTarget.style.opacity = '0.8';
                                    }
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.opacity = '1';
                                  }}
                                >
                                  <div style={{
                                    height: '70px',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'flex-end',
                                    alignItems: 'center',
                                  }}>
                                    <div style={{
                                      width: '100%',
                                      maxWidth: '50px',
                                      height: `${Math.max(barHeight, 4)}px`,
                                      background: barColor,
                                      borderRadius: '4px 4px 0 0',
                                      opacity: amount > 0 ? 1 : 0.3,
                                      border: isSelected ? `2px solid ${baseColor}` : 'none',
                                      boxShadow: isSelected ? `0 0 0 1px ${baseColor}40` : 'none',
                                      transition: 'all 0.2s',
                                    }} />
                                  </div>
                                  <div style={{ 
                                    fontSize: '10px', 
                                    fontWeight: isSelected ? '700' : '600', 
                                    marginTop: '4px',
                                    color: isSelected ? baseColor : '#374151',
                                  }}>
                                    {month.shortName}
                                  </div>
                                  <div style={{ 
                                    fontSize: '10px', 
                                    color: amount > 0 ? (isSelected ? baseColor : '#374151') : '#9ca3af',
                                    fontWeight: isSelected ? '600' : '400',
                                  }}>
                                    {amount > 0 ? formatCurrency(amount) : '-'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Transaction List */}
                          {cat.transactions && cat.transactions.length > 0 && (
                            <div style={{ marginTop: '20px' }}>
                              <div style={{ 
                                display: 'flex', 
                                justifyContent: 'space-between', 
                                alignItems: 'center',
                                marginBottom: '12px',
                              }}>
                                <div>
                                  <h4 style={{ 
                                    margin: 0, 
                                    fontSize: '15px', 
                                    fontWeight: '600',
                                    color: getCategoryColor(cat.category),
                                  }}>
                                    {cat.category} Transactions
                                    {selectedMonthIndex !== null && (
                                      <span style={{ fontSize: '13px', fontWeight: '400', marginLeft: '8px', color: '#6b7280' }}>
                                        ({filteredTransactions.length} in {analysis.monthlySummary[selectedMonthIndex]?.monthName})
                                      </span>
                                    )}
                                  </h4>
                                  <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '4px' }}>
                                    {selectedMonthIndex !== null 
                                      ? `${filteredTransactions.length} transactions in ${analysis.monthlySummary[selectedMonthIndex]?.monthName}`
                                      : `${cat.totalTransactionCount || cat.transactionCount} transactions • ${formatCurrency(cat.yearTotal)} total`
                                    }
                                  </div>
                                </div>
                              </div>

                              {filteredTransactions && filteredTransactions.length > 0 ? (
                                <div style={{ 
                                  maxHeight: '400px', 
                                  overflowY: 'auto',
                                  background: 'white',
                                  borderRadius: '8px',
                                  border: '1px solid #e5e7eb',
                                }}>
                                  {filteredTransactions.map((txn, idx) => (
                                    <div
                                      key={txn.id}
                                      style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        padding: '12px 15px',
                                        borderBottom: idx < filteredTransactions.length - 1 
                                          ? '1px solid #f3f4f6' 
                                          : 'none',
                                      }}
                                    >
                                      <div style={{ flex: 1, minWidth: 0 }}>
                                        <div style={{ 
                                          fontWeight: '500', 
                                          fontSize: '14px',
                                          whiteSpace: 'nowrap',
                                          overflow: 'hidden',
                                          textOverflow: 'ellipsis',
                                        }}>
                                          {txn.name}
                                        </div>
                                        <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                          {new Date(txn.date).toLocaleDateString('en-US', {
                                            month: 'short',
                                            day: 'numeric',
                                            year: 'numeric',
                                          })}
                                          {txn.merchant && txn.merchant !== txn.name && (
                                            <span> • {txn.merchant}</span>
                                          )}
                                        </div>
                                      </div>
                                      <div style={{ 
                                        fontWeight: '600', 
                                        fontSize: '14px',
                                        color: '#111827',
                                        marginLeft: '15px',
                                      }}>
                                        {formatCurrencyDetailed(txn.amount)}
                                      </div>
                                    </div>
                                  ))}
                                  
                                  {cat.hasMoreTransactions && selectedMonthIndex === null && (
                                    <div style={{ 
                                      padding: '12px 15px', 
                                      textAlign: 'center', 
                                      color: '#6b7280',
                                      background: '#f9fafb',
                                      fontSize: '13px',
                                    }}>
                                      Showing 100 of {cat.totalTransactionCount} transactions
                                    </div>
                                  )}
                                </div>
                              ) : selectedMonthIndex !== null ? (
                                <div style={{ 
                                  padding: '40px 20px',
                                  textAlign: 'center',
                                  background: 'white',
                                  borderRadius: '8px',
                                  border: '1px solid #e5e7eb',
                                  color: '#6b7280',
                                }}>
                                  <div style={{ fontSize: '14px' }}>
                                    No transactions found for {analysis.monthlySummary[selectedMonthIndex]?.monthName}
                                  </div>
                                  <div style={{ fontSize: '12px', marginTop: '4px', color: '#9ca3af' }}>
                                    Click on another month or click the same month again to show all transactions
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* By Month View - Similar to category view but organized by month */}
          {viewMode === 'byMonth' && (
            <div style={{
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '20px',
                borderBottom: '1px solid #e5e7eb',
                background: '#f9fafb',
              }}>
                <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                  Spending by Month
                </h3>
                <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#6b7280' }}>
                  Click a month to see category breakdown
                </p>
              </div>
              
              <div>
                {analysis.monthlySummary
                  .map((month, originalIndex) => ({ ...month, originalIndex }))
                  .filter(month => month.transactionCount > 0)
                  .reverse()
                  .map((month) => {
                    // Use originalIndex (position in the monthlySummary array) for monthlyBreakdown lookups
                    // This matches how the API builds the array: index 0 = oldest month, 11 = newest
                    const monthIndex = month.originalIndex;
                    const isLast12Months = selectedYear === 'last12months';

                    const monthCategories = analysis.categoryStats
                      .filter(cat => {
                        // Check if this category has data for this month
                        if (!cat.monthlyBreakdown || !Array.isArray(cat.monthlyBreakdown)) return false;
                        const monthAmount = cat.monthlyBreakdown[monthIndex] || 0;
                        return monthAmount > 0;
                      })
                      .map(cat => {
                        const amount = cat.monthlyBreakdown[monthIndex] || 0;
                        return {
                          category: cat.category,
                          amount: amount,
                          isExpense: cat.isExpense,
                          percentOfMonth: month.totalExpenses > 0 && cat.isExpense
                            ? Math.round((amount / month.totalExpenses) * 1000) / 10
                            : (month.totalIncome > 0 && !cat.isExpense && cat.category === 'Income'
                              ? Math.round((amount / month.totalIncome) * 1000) / 10
                              : 0),
                        };
                      })
                      .sort((a, b) => b.amount - a.amount);

                    const isExpanded = expandedMonth === month.originalIndex;
                    
                    return (
                      <div key={month.originalIndex}>
                        {/* Month Row */}
                        <div
                          onClick={() => {
                            setExpandedMonth(isExpanded ? null : month.originalIndex);
                            setExpandedCategory(null);
                            setSelectedCategoryInMonth(null); // Reset category selection when collapsing/expanding month
                          }}
                          style={{
                            display: 'grid',
                            gridTemplateColumns: '1fr auto auto auto',
                            gap: '20px',
                            alignItems: 'center',
                            padding: '16px 20px',
                            borderBottom: '1px solid #f3f4f6',
                            cursor: 'pointer',
                            background: isExpanded ? '#f9fafb' : 'white',
                            transition: 'background 0.2s',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f9fafb'}
                          onMouseLeave={(e) => e.currentTarget.style.background = isExpanded ? '#f9fafb' : 'white'}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '40px',
                              height: '40px',
                              borderRadius: '10px',
                              background: month.netChange >= 0 
                                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              color: 'white',
                              fontSize: '14px',
                              fontWeight: '700',
                            }}>
                              {month.shortName.substring(0, 3)}
                            </div>
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: '600', fontSize: '15px' }}>{month.monthName}</div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                {month.transactionCount} transactions • {monthCategories.length} categories
                              </div>
                            </div>
                          </div>
                          
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Expenses</div>
                            <div style={{ fontWeight: '600', fontSize: '14px', color: '#ef4444' }}>
                              {formatCurrency(month.totalExpenses)}
                            </div>
                          </div>
                          
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>Income</div>
                            <div style={{ fontWeight: '600', fontSize: '14px', color: '#10b981' }}>
                              {formatCurrency(month.totalIncome)}
                            </div>
                          </div>
                          
                          <div style={{ textAlign: 'right', minWidth: '100px' }}>
                            <div style={{ fontWeight: '700', fontSize: '18px', color: month.netChange >= 0 ? '#10b981' : '#ef4444' }}>
                              {month.netChange >= 0 ? '+' : ''}{formatCurrency(month.netChange)}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6b7280' }}>
                              Net change
                            </div>
                          </div>
                        </div>
                        
                        {/* Expanded Category Breakdown */}
                        {isExpanded && (
                          <div style={{
                            padding: '15px 20px 20px',
                            background: '#f9fafb',
                            borderBottom: '1px solid #e5e7eb',
                          }}>
                            <div style={{ fontSize: '13px', fontWeight: '600', color: '#6b7280', marginBottom: '12px' }}>
                              Category Breakdown for {month.monthName}
                            </div>
                            
                            {monthCategories.length > 0 ? (
                              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                {monthCategories.map((catData) => {
                                  const maxAmount = Math.max(...monthCategories.map(c => c.amount));
                                  const barWidth = maxAmount > 0 ? (catData.amount / maxAmount) * 100 : 0;
                                  const isCategorySelected = selectedCategoryInMonth?.monthIndex === month.originalIndex && selectedCategoryInMonth?.category === catData.category;
                                  
                                  // Find the full category stats to get transactions
                                  const fullCategoryStats = analysis.categoryStats.find(cat => cat.category === catData.category);
                                  
                                  // Filter transactions for this month
                                  // The monthlyBreakdown array is indexed by month position (0-11) in the period
                                  // We need to match transactions to this specific month
                                  const monthTransactions = fullCategoryStats?.transactions?.filter(txn => {
                                    if (!txn.date) return false;
                                    const txnDate = new Date(txn.date);
                                    
                                    // Parse date as local date to avoid timezone issues
                                    const dateStr = typeof txn.date === 'string' ? txn.date : txnDate.toISOString().split('T')[0];
                                    const [year, month, day] = dateStr.split('-').map(Number);
                                    const localTxnDate = new Date(year, month - 1, day);
                                    
                                    // Get the month's date range from monthlySummary
                                    // The month object should have month/year info, or we can derive it from the period
                                    const isLast12Months = selectedYear === 'last12months';
                                    
                                    if (isLast12Months) {
                                      // For last 12 months, calculate the target month from period start
                                      const periodStart = new Date();
                                      periodStart.setMonth(periodStart.getMonth() - 11);
                                      periodStart.setDate(1);
                                      periodStart.setHours(0, 0, 0, 0);
                                      
                                      const targetMonth = new Date(periodStart);
                                      targetMonth.setMonth(targetMonth.getMonth() + month.originalIndex);
                                      
                                      return localTxnDate.getMonth() === targetMonth.getMonth() && 
                                             localTxnDate.getFullYear() === targetMonth.getFullYear();
                                    } else {
                                      // Calendar year - match month index (0-11) and year
                                      return localTxnDate.getMonth() === monthIndex && 
                                             localTxnDate.getFullYear() === parseInt(selectedYear);
                                    }
                                  }) || [];
                                  
                                  return (
                                    <div key={catData.category}>
                                      <div 
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          const newSelection = isCategorySelected 
                                            ? null 
                                            : { monthIndex: month.originalIndex, category: catData.category };
                                          setSelectedCategoryInMonth(newSelection);
                                        }}
                                        style={{
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '12px',
                                          padding: '8px 12px',
                                          background: isCategorySelected ? '#f0f9ff' : 'white',
                                          borderRadius: '6px',
                                          border: isCategorySelected 
                                            ? `2px solid ${getCategoryColor(catData.category)}` 
                                            : '1px solid #e5e7eb',
                                          cursor: 'pointer',
                                          transition: 'all 0.2s',
                                        }}
                                        onMouseEnter={(e) => {
                                          if (!isCategorySelected) {
                                            e.currentTarget.style.background = '#f9fafb';
                                            e.currentTarget.style.borderColor = getCategoryColor(catData.category) + '60';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (!isCategorySelected) {
                                            e.currentTarget.style.background = 'white';
                                            e.currentTarget.style.borderColor = '#e5e7eb';
                                          }
                                        }}
                                      >
                                        <div 
                                          style={{
                                            width: '24px',
                                            height: '24px',
                                            borderRadius: '6px',
                                            background: getCategoryColor(catData.category),
                                            flexShrink: 0,
                                          }}
                                        />
                                        <div style={{ width: '150px', fontSize: '13px', fontWeight: '500', flexShrink: 0 }}>
                                          {catData.category}
                                        </div>
                                        <div style={{ 
                                          flex: 1, 
                                          height: '20px', 
                                          background: '#f3f4f6', 
                                          borderRadius: '4px',
                                          overflow: 'hidden',
                                        }}>
                                          <div style={{
                                            width: `${Math.max(barWidth, 2)}%`,
                                            height: '100%',
                                            background: getCategoryColor(catData.category),
                                            borderRadius: '4px',
                                            transition: 'width 0.3s ease',
                                            minWidth: '4px',
                                          }} />
                                        </div>
                                        <div style={{ width: '80px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>
                                          {catData.percentOfMonth}%
                                        </div>
                                        <div style={{ width: '100px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                                          {formatCurrency(catData.amount)}
                                        </div>
                                      </div>
                                      
                                      {/* Show transactions when category is selected */}
                                      {isCategorySelected && monthTransactions.length > 0 && (
                                        <div style={{
                                          marginTop: '8px',
                                          marginLeft: '44px',
                                          padding: '12px',
                                          background: 'white',
                                          borderRadius: '6px',
                                          border: '1px solid #e5e7eb',
                                          maxHeight: '300px',
                                          overflowY: 'auto',
                                        }}>
                                          <div style={{ 
                                            fontSize: '12px', 
                                            fontWeight: '600', 
                                            color: '#6b7280', 
                                            marginBottom: '8px' 
                                          }}>
                                            {monthTransactions.length} transaction{monthTransactions.length !== 1 ? 's' : ''} in {month.monthName}
                                          </div>
                                          {monthTransactions.map((txn, tIdx) => (
                                            <div
                                              key={txn.id || `txn-${month.originalIndex}-${catData.category}-${tIdx}`}
                                              style={{
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                padding: '8px 0',
                                                borderBottom: tIdx < monthTransactions.length - 1 
                                                  ? '1px solid #f3f4f6' 
                                                  : 'none',
                                              }}
                                            >
                                              <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ 
                                                  fontWeight: '500', 
                                                  fontSize: '13px',
                                                  whiteSpace: 'nowrap',
                                                  overflow: 'hidden',
                                                  textOverflow: 'ellipsis',
                                                }}>
                                                  {txn.name || 'Unknown'}
                                                </div>
                                                <div style={{ fontSize: '11px', color: '#6b7280' }}>
                                                  {txn.date ? new Date(txn.date).toLocaleDateString('en-US', {
                                                    month: 'short',
                                                    day: 'numeric',
                                                    year: 'numeric',
                                                  }) : ''}
                                                  {txn.merchant && txn.merchant !== txn.name && (
                                                    <span> • {txn.merchant}</span>
                                                  )}
                                                </div>
                                              </div>
                                              <div style={{ 
                                                fontWeight: '600', 
                                                fontSize: '13px',
                                                color: '#111827',
                                                marginLeft: '15px',
                                              }}>
                                                {formatCurrencyDetailed(txn.amount || 0)}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      )}
                                      
                                      {isCategorySelected && monthTransactions.length === 0 && (
                                        <div style={{
                                          marginTop: '8px',
                                          marginLeft: '44px',
                                          padding: '12px',
                                          background: '#f9fafb',
                                          borderRadius: '6px',
                                          border: '1px solid #e5e7eb',
                                          fontSize: '12px',
                                          color: '#6b7280',
                                          textAlign: 'center',
                                        }}>
                                          No transactions found for {catData.category} in {month.monthName}
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                                No category data available for this month
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* Budget Check View - This Month vs Last Month */}
          {viewMode === 'monthly' && (() => {
            const monthsWithData = analysis.monthlySummary
              .map((m, i) => ({ ...m, originalIndex: i }))
              .filter(m => m.transactionCount > 0);
            const thisMonth = monthsWithData[monthsWithData.length - 1] || null;
            const lastMonth = monthsWithData[monthsWithData.length - 2] || null;

            const categoryComparison = analysis.categoryStats
              .filter(cat => cat.isExpense && cat.category !== 'Transfer')
              .map(cat => {
                const thisAmt = thisMonth ? (cat.monthlyBreakdown[thisMonth.originalIndex] || 0) : 0;
                const lastAmt = lastMonth ? (cat.monthlyBreakdown[lastMonth.originalIndex] || 0) : 0;
                const change = lastAmt > 0 ? ((thisAmt - lastAmt) / lastAmt) * 100 : (thisAmt > 0 ? 100 : 0);
                return { category: cat.category, thisMonth: thisAmt, lastMonth: lastAmt, changePercent: change };
              })
              .filter(c => c.thisMonth > 0 || c.lastMonth > 0)
              .sort((a, b) => b.thisMonth - a.thisMonth);

            if (!thisMonth) {
              return (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280', background: 'white', borderRadius: '12px', border: '1px solid #e5e7eb' }}>
                  No transaction data available yet.
                </div>
              );
            }

            return (
              <div style={{
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                overflow: 'hidden',
              }}>
                {/* Header: Two month totals side by side */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: lastMonth ? '1fr 1fr' : '1fr',
                  borderBottom: '1px solid #e5e7eb',
                }}>
                  <div style={{ padding: '20px', borderRight: lastMonth ? '1px solid #e5e7eb' : 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <div style={{ fontWeight: '700', fontSize: '16px' }}>{thisMonth.monthName}</div>
                      <span style={{
                        padding: '2px 8px',
                        background: '#dbeafe',
                        color: '#1d4ed8',
                        borderRadius: '4px',
                        fontSize: '11px',
                        fontWeight: '600',
                      }}>In Progress</span>
                    </div>
                    <div style={{ display: 'flex', gap: '24px' }}>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Expenses</div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#ef4444' }}>{formatCurrency(thisMonth.totalExpenses)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Income</div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: '#10b981' }}>{formatCurrency(thisMonth.totalIncome)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '11px', color: '#6b7280' }}>Net</div>
                        <div style={{ fontSize: '22px', fontWeight: '700', color: thisMonth.netChange >= 0 ? '#10b981' : '#ef4444' }}>
                          {thisMonth.netChange >= 0 ? '+' : ''}{formatCurrency(thisMonth.netChange)}
                        </div>
                      </div>
                    </div>
                  </div>
                  {lastMonth && (
                    <div style={{ padding: '20px' }}>
                      <div style={{ fontWeight: '700', fontSize: '16px', marginBottom: '12px' }}>{lastMonth.monthName}</div>
                      <div style={{ display: 'flex', gap: '24px' }}>
                        <div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Expenses</div>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: '#ef4444' }}>{formatCurrency(lastMonth.totalExpenses)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Income</div>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: '#10b981' }}>{formatCurrency(lastMonth.totalIncome)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>Net</div>
                          <div style={{ fontSize: '22px', fontWeight: '700', color: lastMonth.netChange >= 0 ? '#10b981' : '#ef4444' }}>
                            {lastMonth.netChange >= 0 ? '+' : ''}{formatCurrency(lastMonth.netChange)}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Category-by-category comparison */}
                <div style={{ padding: '20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb' }}>
                  <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '600', color: '#374151' }}>
                    Category Comparison
                  </h3>
                  <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#6b7280' }}>
                    {thisMonth.monthName} vs {lastMonth ? lastMonth.monthName : 'N/A'}
                  </p>
                </div>

                {/* Column headers */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 120px 100px',
                  gap: '12px',
                  padding: '10px 20px',
                  fontSize: '11px',
                  fontWeight: '600',
                  color: '#6b7280',
                  borderBottom: '1px solid #f3f4f6',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                }}>
                  <div>Category</div>
                  <div style={{ textAlign: 'right' }}>{thisMonth.shortName}</div>
                  <div style={{ textAlign: 'right' }}>{lastMonth ? lastMonth.shortName : '-'}</div>
                  <div style={{ textAlign: 'right' }}>Change</div>
                </div>

                {/* Category rows */}
                <div>
                  {categoryComparison.map((cat) => {
                    const isUp = cat.changePercent > 0;
                    const isDown = cat.changePercent < 0;
                    const isNew = cat.lastMonth === 0 && cat.thisMonth > 0;
                    const isGone = cat.thisMonth === 0 && cat.lastMonth > 0;

                    return (
                      <div
                        key={cat.category}
                        style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 120px 120px 100px',
                          gap: '12px',
                          alignItems: 'center',
                          padding: '12px 20px',
                          borderBottom: '1px solid #f3f4f6',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <div style={{
                            width: '10px',
                            height: '10px',
                            borderRadius: '3px',
                            background: getCategoryColor(cat.category),
                            flexShrink: 0,
                          }} />
                          <span style={{ fontSize: '14px', fontWeight: '500' }}>{cat.category}</span>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                          {cat.thisMonth > 0 ? formatCurrency(cat.thisMonth) : '-'}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '14px', color: '#6b7280' }}>
                          {cat.lastMonth > 0 ? formatCurrency(cat.lastMonth) : '-'}
                        </div>
                        <div style={{ textAlign: 'right', fontSize: '13px', fontWeight: '600' }}>
                          {isNew ? (
                            <span style={{ color: '#6b7280' }}>New</span>
                          ) : isGone ? (
                            <span style={{ color: '#10b981' }}>Gone</span>
                          ) : lastMonth ? (
                            <span style={{ color: isUp ? '#ef4444' : isDown ? '#10b981' : '#6b7280' }}>
                              {isUp ? '\u2191' : isDown ? '\u2193' : '-'} {Math.abs(Math.round(cat.changePercent))}%
                            </span>
                          ) : (
                            <span style={{ color: '#6b7280' }}>-</span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Totals footer */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 120px 120px 100px',
                  gap: '12px',
                  padding: '14px 20px',
                  background: '#f9fafb',
                  fontWeight: '700',
                  fontSize: '14px',
                }}>
                  <div>Total Expenses</div>
                  <div style={{ textAlign: 'right', color: '#ef4444' }}>
                    {formatCurrency(thisMonth.totalExpenses)}
                  </div>
                  <div style={{ textAlign: 'right', color: '#ef4444' }}>
                    {lastMonth ? formatCurrency(lastMonth.totalExpenses) : '-'}
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    {lastMonth && lastMonth.totalExpenses > 0 ? (() => {
                      const pct = ((thisMonth.totalExpenses - lastMonth.totalExpenses) / lastMonth.totalExpenses) * 100;
                      const isUp = pct > 0;
                      return (
                        <span style={{ color: isUp ? '#ef4444' : '#10b981' }}>
                          {isUp ? '\u2191' : '\u2193'} {Math.abs(Math.round(pct))}%
                        </span>
                      );
                    })() : '-'}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Category Comparison Chart */}
          {(() => {
            const expenseCategories = analysis.categoryStats
              .filter(cat => cat.isExpense && cat.category !== 'Income');
            const maxCategoryTotal = Math.max(...expenseCategories.map(c => c.yearTotal));
            const categoriesToShow = showAllCategories 
              ? expenseCategories 
              : expenseCategories.slice(0, 10);
            const hiddenCount = expenseCategories.length - 10;
            const hiddenTotal = expenseCategories
              .slice(10)
              .reduce((sum, c) => sum + c.yearTotal, 0);

            return (
              <div style={{
                marginTop: '25px',
                padding: '25px',
                background: 'white',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                    Category Distribution
                  </h3>
                  <div style={{ fontSize: '13px', color: '#6b7280' }}>
                    {expenseCategories.length} categories • Click to see transactions
                  </div>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {categoriesToShow.map((cat, idx) => {
                    // Scale relative to largest category (so largest = 100%)
                    const barWidth = maxCategoryTotal > 0 
                      ? (cat.yearTotal / maxCategoryTotal) * 100 
                      : 0;
                    
                    return (
                      <div 
                        key={cat.category} 
                        onClick={() => setSelectedCategoryForTransactions(
                          selectedCategoryForTransactions === cat.category ? null : cat.category
                        )}
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px',
                          padding: '8px 12px',
                          margin: '0 -12px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          background: selectedCategoryForTransactions === cat.category ? '#f3f4f6' : 'transparent',
                          transition: 'background 0.2s',
                        }}
                        onMouseEnter={(e) => {
                          if (selectedCategoryForTransactions !== cat.category) {
                            e.currentTarget.style.background = '#f9fafb';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedCategoryForTransactions !== cat.category) {
                            e.currentTarget.style.background = 'transparent';
                          }
                        }}
                      >
                        <div style={{ width: '130px', fontSize: '13px', fontWeight: '500', flexShrink: 0 }}>
                          {cat.category}
                        </div>
                        <div style={{ 
                          flex: 1, 
                          height: '28px', 
                          background: '#f3f4f6', 
                          borderRadius: '6px',
                          overflow: 'hidden',
                        }}>
                          <div style={{
                            width: `${Math.max(barWidth, 2)}%`,
                            height: '100%',
                            background: getCategoryColor(cat.category),
                            borderRadius: '6px',
                            transition: 'width 0.3s ease',
                            minWidth: '4px',
                          }} />
                        </div>
                        <div style={{ width: '60px', textAlign: 'right', fontSize: '13px', fontWeight: '600' }}>
                          {cat.percentOfTotal}%
                        </div>
                        <div style={{ width: '100px', textAlign: 'right', fontSize: '14px', fontWeight: '600' }}>
                          {formatCurrency(cat.yearTotal)}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Show more/less button */}
                {expenseCategories.length > 10 && (
                  <button
                    onClick={() => setShowAllCategories(!showAllCategories)}
                    style={{
                      marginTop: '15px',
                      padding: '10px 20px',
                      background: '#f3f4f6',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '13px',
                      fontWeight: '500',
                      color: '#374151',
                      width: '100%',
                    }}
                  >
                    {showAllCategories 
                      ? 'Show Less' 
                      : `Show ${hiddenCount} More Categories (${formatCurrency(hiddenTotal)} total)`
                    }
                  </button>
                )}

                {/* Transaction Details Panel */}
                {selectedCategoryForTransactions && (() => {
                  const selectedCat = analysis.categoryStats.find(
                    c => c.category === selectedCategoryForTransactions
                  );
                  if (!selectedCat) return null;

                  return (
                    <div style={{
                      marginTop: '20px',
                      padding: '20px',
                      background: '#f9fafb',
                      borderRadius: '12px',
                      border: `2px solid ${getCategoryColor(selectedCat.category)}`,
                    }}>
                      <div style={{ 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        marginBottom: '15px',
                      }}>
                        <div>
                          <h4 style={{ 
                            margin: 0, 
                            fontSize: '16px', 
                            fontWeight: '600',
                            color: getCategoryColor(selectedCat.category),
                          }}>
                            {selectedCat.category} Transactions
                          </h4>
                          <div style={{ fontSize: '13px', color: '#6b7280', marginTop: '4px' }}>
                            {selectedCat.totalTransactionCount || selectedCat.transactionCount} transactions • 
                            {formatCurrency(selectedCat.yearTotal)} total
                          </div>
                        </div>
                        <button
                          onClick={() => setSelectedCategoryForTransactions(null)}
                          style={{
                            padding: '6px 12px',
                            background: 'white',
                            border: '1px solid #d1d5db',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '13px',
                          }}
                        >
                          Close
                        </button>
                      </div>

                      <div style={{ 
                        maxHeight: '400px', 
                        overflowY: 'auto',
                        background: 'white',
                        borderRadius: '8px',
                        border: '1px solid #e5e7eb',
                      }}>
                        {selectedCat.transactions && selectedCat.transactions.length > 0 ? (
                          selectedCat.transactions.map((txn, idx) => (
                            <div
                              key={txn.id}
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                alignItems: 'center',
                                padding: '12px 15px',
                                borderBottom: idx < selectedCat.transactions.length - 1 
                                  ? '1px solid #f3f4f6' 
                                  : 'none',
                              }}
                            >
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                  fontWeight: '500', 
                                  fontSize: '14px',
                                  whiteSpace: 'nowrap',
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                }}>
                                  {txn.name}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                  {new Date(txn.date).toLocaleDateString('en-US', {
                                    month: 'short',
                                    day: 'numeric',
                                    year: 'numeric',
                                  })}
                                  {txn.merchant && txn.merchant !== txn.name && (
                                    <span> • {txn.merchant}</span>
                                  )}
                                </div>
                              </div>
                              <div style={{ 
                                fontWeight: '600', 
                                fontSize: '14px',
                                color: '#111827',
                                marginLeft: '15px',
                              }}>
                                {formatCurrencyDetailed(txn.amount)}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ padding: '20px', textAlign: 'center', color: '#6b7280' }}>
                            No transaction details available
                          </div>
                        )}
                        
                        {selectedCat.hasMoreTransactions && (
                          <div style={{ 
                            padding: '12px 15px', 
                            textAlign: 'center', 
                            color: '#6b7280',
                            background: '#f9fafb',
                            fontSize: '13px',
                          }}>
                            Showing 100 of {selectedCat.totalTransactionCount} transactions
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
        </>
      )}

      {/* Color Picker Modal */}
      {colorPickerOpen && (
        <CategoryColorPicker
          category={colorPickerOpen}
          currentColor={getCategoryColor(colorPickerOpen)}
          position={colorPickerPosition}
          onColorChange={(newColor) => {
            setCustomColors(prev => ({
              ...prev,
              [colorPickerOpen]: newColor,
            }));
          }}
          onClose={() => setColorPickerOpen(null)}
        />
      )}
    </div>
  );
}

