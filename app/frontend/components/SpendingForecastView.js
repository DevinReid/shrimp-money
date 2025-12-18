'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './auth/AuthContext';

export default function SpendingForecastView() {
  const [forecast, setForecast] = useState(null);
  const [dailyProjections, setDailyProjections] = useState([]);
  const [criticalDates, setCriticalDates] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [daysToForecast, setDaysToForecast] = useState(30);
  const [customBalance, setCustomBalance] = useState('');
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [hoveredPayment, setHoveredPayment] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayPosition, setSelectedDayPosition] = useState({ x: 0, y: 0 });
  const { token } = useAuth();

  const fetchForecast = async (startBalance = null) => {
    try {
      setLoading(true);
      setError(null);
      
      let url = `/api/plaid/spending-forecast?days=${daysToForecast}`;
      if (startBalance) {
        url += `&startBalance=${startBalance}`;
      }
      
      const response = await fetch(url, {
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
        setForecast(data.forecast);
        setDailyProjections(data.dailyProjections || []);
        setCriticalDates(data.criticalDates || []);
        setAccounts(data.accounts || []);
        
        // DEBUG: Compare netChange calculations and check specific days
        const lastDay = data.dailyProjections?.[data.dailyProjections.length - 1];
        const cumulativeFromLastDay = lastDay ? lastDay.runningBalance - data.forecast.startingBalance : 0;
        const netChangeFromEnding = data.forecast.endingBalance - data.forecast.startingBalance;
        
        // Check Jan 14 and Jan 15 specifically
        const jan14 = data.dailyProjections?.find(d => d.date === '2026-01-14');
        const jan15 = data.dailyProjections?.find(d => d.date === '2026-01-15');
        
        console.log('🔍 FRONTEND NET CHANGE COMPARISON:', {
          netChangeFromAPI: data.forecast.netChange,
          cumulativeFromLastDay,
          netChangeFromEnding,
          endingBalance: data.forecast.endingBalance,
          startingBalance: data.forecast.startingBalance,
          lastDayDate: lastDay?.date,
          lastDayRunningBalance: lastDay?.runningBalance,
          difference: data.forecast.netChange - cumulativeFromLastDay,
        });
        
        if (jan14) {
          const jan14Cumulative = jan14.runningBalance - data.forecast.startingBalance;
          console.log('🔍 JAN 14 DEBUG:', {
            date: jan14.date,
            runningBalance: jan14.runningBalance,
            startingBalance: data.forecast.startingBalance,
            cumulativeChange: jan14Cumulative,
            totalIncome: jan14.totalIncome,
            totalExpenses: jan14.totalExpenses,
            netChange: jan14.netChange,
          });
        }
        
        if (jan15) {
          const jan15Cumulative = jan15.runningBalance - data.forecast.startingBalance;
          console.log('🔍 JAN 15 DEBUG:', {
            date: jan15.date,
            runningBalance: jan15.runningBalance,
            startingBalance: data.forecast.startingBalance,
            cumulativeChange: jan15Cumulative,
            totalIncome: jan15.totalIncome,
            totalExpenses: jan15.totalExpenses,
            netChange: jan15.netChange,
          });
        }
        
        // Check if last day in upcoming payments matches the ending balance
        const lastActiveDay = data.dailyProjections?.[data.dailyProjections.length - 1];
        if (lastActiveDay) {
          const lastDayCumulative = lastActiveDay.runningBalance - data.forecast.startingBalance;
          console.log('🔍 LAST DAY vs NET CHANGE:', {
            lastDayDate: lastActiveDay.date,
            lastDayRunningBalance: lastActiveDay.runningBalance,
            endingBalance: data.forecast.endingBalance,
            startingBalance: data.forecast.startingBalance,
            lastDayCumulative,
            netChangeFromAPI: data.forecast.netChange,
            difference: data.forecast.netChange - lastDayCumulative,
          });
        }
      }
    } catch (err) {
      console.error('Error fetching forecast:', err);
      setError('Failed to fetch spending forecast');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      fetchForecast();
    }
  }, [token, daysToForecast]);

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  // Parse date string as local time to avoid timezone shift
  // '2025-12-24' should display as Dec 24, not Dec 23
  const parseLocalDate = (dateString) => {
    const [year, month, day] = dateString.split('-').map(Number);
    return new Date(year, month - 1, day); // month is 0-indexed
  };

  const formatDate = (dateString) => {
    const localDate = parseLocalDate(dateString);
    return localDate.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Format date as YYYY-MM-DD in local time
  const formatLocalDate = (date) => {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const handleWhatIfApply = () => {
    if (customBalance) {
      fetchForecast(parseFloat(customBalance));
    }
  };

  const handleWhatIfReset = () => {
    setCustomBalance('');
    setShowWhatIf(false);
    fetchForecast();
  };

  // Calculate chart data
  const chartData = useMemo(() => {
    if (!dailyProjections.length || !forecast) return null;

    const balances = dailyProjections.map(d => d.runningBalance);
    const maxBalance = Math.max(forecast.startingBalance, ...balances);
    const minBalance = Math.min(...balances, 0);
    const range = maxBalance - minBalance || 1;

    return {
      balances,
      maxBalance,
      minBalance,
      range,
    };
  }, [dailyProjections, forecast]);

  // Get days with activity (expenses or income) within the forecast period
  const activeDays = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const maxDays = daysToForecast > 30 ? daysToForecast : 30;
    
    // Filter days with activity
    // Include days from today (daysDiff = 0) through maxDays (inclusive)
    // So for 30 days: days 0-30 (31 days total, including today)
    const daysWithActivity = dailyProjections.filter(d => {
      // Use parseLocalDate to avoid timezone issues
      const dayDate = parseLocalDate(d.date);
      dayDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((dayDate - today) / (1000 * 60 * 60 * 24));
      // Include today (daysDiff === 0) through day maxDays (inclusive)
      return daysDiff >= 0 && daysDiff <= maxDays && (d.expenses.length > 0 || d.income.length > 0);
    });
    
    // Always include the last day of the forecast period, even if it has no activity
    // This ensures the cumulative change matches the "Net Change" at the top
    const lastDay = dailyProjections[dailyProjections.length - 1];
    if (lastDay && !daysWithActivity.find(d => d.date === lastDay.date)) {
      // Check if last day is within the forecast window
      const lastDayDate = parseLocalDate(lastDay.date);
      lastDayDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((lastDayDate - today) / (1000 * 60 * 60 * 24));
      // Include if it's within the forecast period (inclusive)
      if (daysDiff >= 0 && daysDiff <= maxDays) {
        daysWithActivity.push(lastDay);
      }
    }
    
    return daysWithActivity;
  }, [dailyProjections, daysToForecast]);
  
  // Calculate baseline balance from the first day in the upcoming payments list
  // This ensures the cumulative change shows the change from the beginning of the visible period
  // The last day's cumulative change will then match the total change across the visible period
  const baselineBalance = useMemo(() => {
    if (activeDays.length > 0 && dailyProjections.length > 0) {
      const firstActiveDate = activeDays[0].date;
      const firstDayIndex = dailyProjections.findIndex(d => d.date === firstActiveDate);
      
      if (firstDayIndex >= 0) {
        // Use the running balance of the day BEFORE the first active day as the baseline
        // This way, the cumulative change shows change from the start of the visible period
        if (firstDayIndex > 0) {
          return dailyProjections[firstDayIndex - 1].runningBalance;
        } else {
          // First day in projections, use starting balance
          return forecast?.startingBalance || 0;
        }
      }
    }
    return forecast?.startingBalance || 0;
  }, [activeDays, dailyProjections, forecast]);

  if (loading && !forecast) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>🔮</div>
        <p style={{ color: '#6b7280' }}>Consulting the shrimp oracle...</p>
      </div>
    );
  }

  return (
    <div style={{ padding: '20px', maxWidth: '1400px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '15px' }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '24px', fontWeight: '600', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🔮</span> Spending Forecast
          </h2>
          <p style={{ margin: '5px 0 0', color: '#6b7280', fontSize: '14px' }}>
            See into your financial future
          </p>
        </div>
        
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <select
            value={daysToForecast}
            onChange={(e) => {
              setDaysToForecast(parseInt(e.target.value));
              fetchForecast();
            }}
            style={{
              padding: '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: '14px',
              background: 'white',
            }}
          >
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={120}>120 days</option>
          </select>
          
          <button
            onClick={() => setShowWhatIf(!showWhatIf)}
            style={{
              padding: '8px 16px',
              background: showWhatIf ? '#667eea' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <span>✨</span> What If...?
          </button>
          
          <button
            onClick={() => fetchForecast()}
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

      {/* What If Panel */}
      {showWhatIf && (
        <div style={{
          padding: '20px',
          background: 'linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)',
          border: '2px solid #667eea',
          borderRadius: '12px',
          marginBottom: '20px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '15px' }}>
            <span style={{ fontSize: '24px' }}>🦐</span>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#4338ca' }}>
                What If I Had Different Money?
              </h3>
              <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#6366f1' }}>
                Imagine the possibilities! Enter a custom starting balance to see how your forecast changes.
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <span style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#6b7280',
              }}>$</span>
              <input
                type="number"
                value={customBalance}
                onChange={(e) => setCustomBalance(e.target.value)}
                placeholder={forecast?.startingBalance?.toFixed(2) || '0.00'}
                style={{
                  padding: '10px 12px 10px 24px',
                  border: '2px solid #667eea',
                  borderRadius: '8px',
                  fontSize: '16px',
                  width: '180px',
                  fontWeight: '600',
                }}
              />
            </div>
            
            <button
              onClick={handleWhatIfApply}
              disabled={!customBalance}
              style={{
                padding: '10px 20px',
                background: customBalance ? '#667eea' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: customBalance ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: '600',
              }}
            >
              ✨ Show Me The Future!
            </button>
            
            <button
              onClick={handleWhatIfReset}
              style={{
                padding: '10px 20px',
                background: 'white',
                color: '#667eea',
                border: '2px solid #667eea',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: '500',
              }}
            >
              Reset to Reality
            </button>
          </div>
        </div>
      )}

      {forecast && (
        <>
          {/* Summary Cards */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '15px',
            marginBottom: '30px',
          }}>
            <div style={{
              padding: '20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>Starting Balance</div>
              <div style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(forecast.startingBalance)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
                {accounts.length} account{accounts.length !== 1 ? 's' : ''}
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              background: forecast.endingBalance >= 0 
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>Projected End Balance</div>
              <div style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(forecast.endingBalance)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
                After {daysToForecast} days
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              background: forecast.lowestBalance >= 0 
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ fontSize: '13px', opacity: 0.9, marginBottom: '5px' }}>Lowest Point</div>
              <div style={{ fontSize: '28px', fontWeight: '700' }}>
                {formatCurrency(forecast.lowestBalance)}
              </div>
              <div style={{ fontSize: '12px', opacity: 0.8, marginTop: '5px' }}>
                on {formatDate(forecast.lowestBalanceDate)}
              </div>
            </div>
            
            <div style={{
              padding: '20px',
              background: '#f9fafb',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}>
              <div style={{ fontSize: '13px', color: '#6b7280', marginBottom: '5px' }}>Net Change</div>
              <div style={{ 
                fontSize: '28px', 
                fontWeight: '700',
                color: forecast.netChange >= 0 ? '#10b981' : '#ef4444',
              }}>
                {forecast.netChange >= 0 ? '+' : ''}{formatCurrency(forecast.netChange)}
              </div>
              <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '5px' }}>
                {formatCurrency(forecast.totalProjectedIncome)} in / {formatCurrency(forecast.totalProjectedExpenses)} out
              </div>
            </div>
          </div>

          {/* Minimum Required Warning */}
          {forecast.minimumRequired > 0 && (
            <div style={{
              padding: '16px 20px',
              background: 'linear-gradient(135deg, #fef2f2 0%, #fee2e2 100%)',
              border: '2px solid #fecaca',
              borderRadius: '12px',
              marginBottom: '25px',
              display: 'flex',
              alignItems: 'center',
              gap: '15px',
            }}>
              <span style={{ fontSize: '28px' }}>⚠️</span>
              <div>
                <div style={{ fontWeight: '600', color: '#991b1b', fontSize: '16px' }}>
                  Heads Up, Shrimp Friend!
                </div>
                <div style={{ color: '#b91c1c', fontSize: '14px', marginTop: '4px' }}>
                  You'll need at least <strong>{formatCurrency(forecast.minimumRequired)}</strong> more 
                  to avoid going negative by {formatDate(forecast.lowestBalanceDate)}.
                </div>
              </div>
            </div>
          )}

          {/* Balance Timeline Chart */}
          {chartData && dailyProjections.length > 0 && (
            <div style={{
              padding: '25px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              marginBottom: '25px',
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: '18px', fontWeight: '600' }}>
                💰 Balance Timeline
              </h3>
              
              <div style={{ position: 'relative', height: '200px', marginBottom: '10px' }}>
                {/* Y-axis labels */}
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 20,
                  width: '80px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  fontSize: '11px',
                  color: '#6b7280',
                  textAlign: 'right',
                  paddingRight: '10px',
                }}>
                  <span>{formatCurrency(chartData.maxBalance)}</span>
                  <span>{formatCurrency((chartData.maxBalance + chartData.minBalance) / 2)}</span>
                  <span>{formatCurrency(chartData.minBalance)}</span>
                </div>
                
                {/* Chart area */}
                <div style={{
                  position: 'absolute',
                  left: '85px',
                  right: 0,
                  top: 0,
                  bottom: 20,
                  background: '#f9fafb',
                  borderRadius: '8px',
                  overflow: 'hidden',
                }}>
                  {/* Zero line */}
                  {chartData.minBalance < 0 && (
                    <div style={{
                      position: 'absolute',
                      left: 0,
                      right: 0,
                      bottom: `${((0 - chartData.minBalance) / chartData.range) * 100}%`,
                      borderTop: '2px dashed #ef4444',
                      opacity: 0.5,
                    }} />
                  )}
                  
                  {/* Balance bars */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'flex-end',
                    height: '100%',
                    gap: '1px',
                    padding: '0 5px',
                    overflowX: daysToForecast > 30 ? 'auto' : 'visible',
                    minWidth: daysToForecast > 30 ? `${Math.max(daysToForecast * 8, 800)}px` : 'auto',
                  }}>
                    {dailyProjections.filter((day) => {
                      // Show timeline based on forecast period
                      // Include days from today (daysDiff = 0) through maxDays (inclusive)
                      // So for 30 days: days 0-30 (31 days total, including today)
                      const dayDate = parseLocalDate(day.date);
                      const today = new Date();
                      today.setHours(0, 0, 0, 0);
                      const daysDiff = Math.floor((dayDate - today) / (1000 * 60 * 60 * 24));
                      const maxDays = daysToForecast > 30 ? daysToForecast : 30;
                      return daysDiff >= 0 && daysDiff <= maxDays;
                    }).map((day, idx) => {
                      const barHeight = ((day.runningBalance - chartData.minBalance) / chartData.range) * 100;
                      const isNegative = day.runningBalance < 0;
                      const isSelected = selectedDay?.date === day.date;
                      
                      // Calculate segments for this day's changes
                      const recurringIncome = day.income.filter(i => 
                        !i.source || (i.source !== 'category-spending' && i.source !== 'transaction-pattern')
                      ).reduce((sum, i) => sum + i.amount, 0);
                      
                      const recurringExpenses = day.expenses.filter(e => 
                        !e.source || (e.source !== 'category-spending' && e.source !== 'transaction-pattern')
                      ).reduce((sum, e) => sum + e.amount, 0);
                      
                      const otherExpenses = day.expenses.filter(e => 
                        e.source === 'category-spending' || e.source === 'transaction-pattern'
                      ).reduce((sum, e) => sum + e.amount, 0);
                      
                      // Calculate total activity for this day (for proportional segments)
                      const totalActivity = Math.abs(recurringIncome) + recurringExpenses + otherExpenses;
                      
                      // Calculate segment heights as percentages of the bar (proportional to activity)
                      const incomeSegmentPercent = totalActivity > 0 ? (Math.abs(recurringIncome) / totalActivity) * 100 : 0;
                      const recurringExpenseSegmentPercent = totalActivity > 0 ? (recurringExpenses / totalActivity) * 100 : 0;
                      const otherExpenseSegmentPercent = totalActivity > 0 ? (otherExpenses / totalActivity) * 100 : 0;
                      
                      const barWidth = daysToForecast > 30 ? '4px' : 'auto';
                      
                      return (
                        <div
                          key={day.date}
                          onClick={(e) => {
                            const rect = e.currentTarget.getBoundingClientRect();
                            setSelectedDayPosition({
                              x: rect.left + rect.width / 2,
                              y: rect.top,
                            });
                            setSelectedDay(selectedDay?.date === day.date ? null : day);
                          }}
                          style={{
                            flex: daysToForecast > 30 ? '0 0 auto' : 1,
                            width: barWidth,
                            height: `${Math.max(barHeight, 2)}%`,
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            opacity: (recurringIncome > 0 || recurringExpenses > 0 || otherExpenses > 0) ? 1 : 0.5,
                            border: isSelected ? '2px solid #667eea' : 'none',
                            boxShadow: isSelected ? '0 0 0 2px rgba(102, 126, 234, 0.2)' : 'none',
                          }}
                          title={`${formatDate(day.date)}: ${formatCurrency(day.runningBalance)}\nCumulative Change: ${(() => {
                            const cumulativeChange = day.runningBalance - baselineBalance;
                            return (cumulativeChange >= 0 ? '+' : '') + formatCurrency(cumulativeChange);
                          })()}\nRecurring Income: ${formatCurrency(recurringIncome)}\nRecurring Expenses: ${formatCurrency(recurringExpenses)}\nOther Expenses: ${formatCurrency(otherExpenses)}`}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.opacity = '0.8';
                              e.currentTarget.style.transform = 'scale(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.opacity = (recurringIncome > 0 || recurringExpenses > 0 || otherExpenses > 0) ? 1 : 0.5;
                              e.currentTarget.style.transform = 'scale(1)';
                            }
                          }}
                        >
                          {/* Segmented bar showing activity composition - fills entire bar */}
                          {totalActivity > 0 ? (
                            <div style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column-reverse',
                              borderRadius: '2px 2px 0 0',
                              overflow: 'hidden',
                            }}>
                              {/* Recurring income segment (green) */}
                              {recurringIncome > 0 && incomeSegmentPercent > 0 && (
                                <div style={{
                                  height: `${incomeSegmentPercent}%`,
                                  background: 'linear-gradient(180deg, #86efac 0%, #10b981 100%)',
                                  minHeight: '2px',
                                  borderTop: '1px solid rgba(255, 255, 255, 0.3)',
                                }} />
                              )}
                              
                              {/* Recurring expenses segment (blue) */}
                              {recurringExpenses > 0 && recurringExpenseSegmentPercent > 0 && (
                                <div style={{
                                  height: `${recurringExpenseSegmentPercent}%`,
                                  background: 'linear-gradient(180deg, #a5b4fc 0%, #667eea 100%)',
                                  minHeight: '2px',
                                  borderTop: '1px solid rgba(255, 255, 255, 0.3)',
                                }} />
                              )}
                              
                              {/* Other expenses segment (orange) */}
                              {otherExpenses > 0 && otherExpenseSegmentPercent > 0 && (
                                <div style={{
                                  height: `${otherExpenseSegmentPercent}%`,
                                  background: 'linear-gradient(180deg, #fcd34d 0%, #f59e0b 100%)',
                                  minHeight: '2px',
                                  borderTop: '1px solid rgba(255, 255, 255, 0.3)',
                                }} />
                              )}
                            </div>
                          ) : (
                            // No activity - show gray bar
                            <div style={{
                              position: 'absolute',
                              bottom: 0,
                              left: 0,
                              right: 0,
                              height: '100%',
                              background: 'linear-gradient(180deg, #e5e7eb 0%, #d1d5db 100%)',
                              borderRadius: '2px 2px 0 0',
                            }} />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
              
              {/* Legend */}
              <div style={{
                display: 'flex',
                gap: '20px',
                justifyContent: 'center',
                fontSize: '12px',
                color: '#6b7280',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#10b981', borderRadius: '2px' }} />
                  <span>Payday (Recurring Income)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#667eea', borderRadius: '2px' }} />
                  <span>Recurring Expenses</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ width: '12px', height: '12px', background: '#f59e0b', borderRadius: '2px' }} />
                  <span>Other Expenses</span>
                </div>
                {daysToForecast > 30 && (
                  <div style={{ fontSize: '11px', color: '#9ca3af', fontStyle: 'italic' }}>
                    Scroll horizontally to see all days
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Day Details Modal/Dropdown */}
          {selectedDay && (() => {
            const modalWidth = 400;
            const totalItems = selectedDay.expenses.length + selectedDay.income.length;
            const modalHeight = Math.min(500, 100 + totalItems * 60);
            const padding = 20;
            
            // Calculate position (centered above the bar, or below if not enough space)
            let left = selectedDayPosition.x - modalWidth / 2;
            let top = selectedDayPosition.y - modalHeight - 10; // Above the bar
            
            // Keep on screen
            if (left < padding) left = padding;
            if (left + modalWidth > window.innerWidth - padding) {
              left = window.innerWidth - modalWidth - padding;
            }
            
            // If not enough space above, show below
            if (top < padding) {
              top = selectedDayPosition.y + 30; // Below the bar
            }
            if (top + modalHeight > window.innerHeight - padding) {
              top = window.innerHeight - modalHeight - padding;
            }
            
            return (
              <div
                style={{
                  position: 'fixed',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  zIndex: 1000,
                }}
                onClick={() => setSelectedDay(null)}
              >
                <div
                  style={{
                    position: 'absolute',
                    left: `${left}px`,
                    top: `${top}px`,
                    width: `${modalWidth}px`,
                    maxHeight: `${modalHeight}px`,
                    background: 'white',
                    borderRadius: '12px',
                    boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: '2px solid #667eea',
                    overflow: 'hidden',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div style={{
                    padding: '16px 20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '16px' }}>
                        {parseLocalDate(selectedDay.date).toLocaleDateString('en-US', {
                          weekday: 'long',
                          month: 'long',
                          day: 'numeric',
                          year: 'numeric',
                        })}
                      </div>
                      <div style={{ fontSize: '12px', opacity: 0.9, marginTop: '2px' }}>
                        Balance: {formatCurrency(selectedDay.runningBalance)}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedDay(null)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '6px',
                        width: '28px',
                        height: '28px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      ×
                    </button>
                  </div>
                  
                  {/* Content */}
                  <div style={{
                    maxHeight: `${modalHeight - 80}px`,
                    overflowY: 'auto',
                    padding: '15px',
                  }}>
                    {/* Income */}
                    {selectedDay.income.length > 0 && (
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#10b981',
                          marginBottom: '8px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          Income (+{formatCurrency(selectedDay.totalIncome)})
                        </div>
                        {selectedDay.income.map((payment, pIdx) => (
                          <div
                            key={`income-${payment.id}-${pIdx}`}
                            style={{
                              padding: '10px 12px',
                              background: '#f0fdf4',
                              borderRadius: '6px',
                              marginBottom: '6px',
                              border: '1px solid #bbf7d0',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '500', fontSize: '14px' }}>
                                  {payment.name}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                  {payment.category} {payment.frequency && `• ${payment.frequency}`}
                                  {payment.source && ` • ${payment.source === 'category-spending' ? 'Weekly estimate' : payment.source}`}
                                </div>
                              </div>
                              <div style={{ fontWeight: '600', fontSize: '15px', color: '#10b981' }}>
                                +{formatCurrency(payment.amount)}
                              </div>
                            </div>
                            {payment.isVariable && payment.amountMin && payment.amountMax && (
                              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                Range: {formatCurrency(payment.amountMin)} - {formatCurrency(payment.amountMax)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Expenses */}
                    {selectedDay.expenses.length > 0 && (
                      <div>
                        <div style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: '#ef4444',
                          marginBottom: '8px',
                          textTransform: 'uppercase',
                          letterSpacing: '0.5px',
                        }}>
                          Expenses (-{formatCurrency(selectedDay.totalExpenses)})
                        </div>
                        {selectedDay.expenses.map((payment, pIdx) => (
                          <div
                            key={`expense-${payment.id}-${pIdx}`}
                            style={{
                              padding: '10px 12px',
                              background: '#fef2f2',
                              borderRadius: '6px',
                              marginBottom: '6px',
                              border: '1px solid #fecaca',
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '500', fontSize: '14px' }}>
                                  {payment.name}
                                </div>
                                <div style={{ fontSize: '12px', color: '#6b7280', marginTop: '2px' }}>
                                  {payment.category} {payment.frequency && `• ${payment.frequency}`}
                                  {payment.source && ` • ${payment.source === 'category-spending' ? 'Weekly estimate' : payment.source}`}
                                </div>
                              </div>
                              <div style={{ fontWeight: '600', fontSize: '15px', color: '#111827' }}>
                                -{formatCurrency(payment.amount)}
                              </div>
                            </div>
                            {payment.isVariable && payment.amountMin && payment.amountMax && (
                              <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '4px' }}>
                                Range: {formatCurrency(payment.amountMin)} - {formatCurrency(payment.amountMax)}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {selectedDay.expenses.length === 0 && selectedDay.income.length === 0 && (
                      <div style={{
                        padding: '20px',
                        textAlign: 'center',
                        color: '#6b7280',
                        fontSize: '14px',
                      }}>
                        No transactions scheduled for this day
                      </div>
                    )}
                  </div>
                  
                  {/* Footer */}
                  <div style={{
                    padding: '12px 20px',
                    background: '#f9fafb',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '13px',
                    color: '#6b7280',
                  }}>
                    <span>Net Change:</span>
                    <span style={{
                      fontWeight: '600',
                      color: selectedDay.netChange >= 0 ? '#10b981' : '#ef4444',
                    }}>
                      {selectedDay.netChange >= 0 ? '+' : ''}{formatCurrency(selectedDay.netChange)}
                    </span>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Critical Dates */}
          {criticalDates.length > 0 && (
            <div style={{
              padding: '20px',
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: '12px',
              marginBottom: '25px',
            }}>
              <h3 style={{ margin: '0 0 15px', fontSize: '16px', fontWeight: '600', color: '#92400e' }}>
                ⚡ Critical Dates to Watch
              </h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {criticalDates.slice(0, 5).map((cd, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 15px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fde68a',
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: '600', color: '#92400e' }}>
                        {formatDate(cd.date)}
                      </div>
                      <div style={{ fontSize: '13px', color: '#a16207' }}>
                        {cd.reason === 'negative_balance' && '⚠️ Balance goes negative!'}
                        {cd.reason === 'stacked_expenses' && `📦 ${cd.expenseCount} expenses stacked`}
                        {cd.reason === 'high_expenses' && '💸 High expense day'}
                      </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: '600', color: '#ef4444' }}>
                        -{formatCurrency(cd.totalExpenses)}
                      </div>
                      <div style={{ 
                        fontSize: '13px', 
                        color: cd.projectedBalance < 0 ? '#ef4444' : '#10b981',
                        fontWeight: '500',
                      }}>
                        → {formatCurrency(cd.projectedBalance)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Expenses by Day */}
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
                📅 Upcoming Payments
              </h3>
              <p style={{ margin: '5px 0 0', fontSize: '13px', color: '#6b7280' }}>
                Expenses and income for the next {daysToForecast} days
              </p>
            </div>
            
            <div style={{ maxHeight: '500px', overflowY: 'auto' }}>
              {activeDays.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: '32px', marginBottom: '10px' }}>🦐</div>
                  <p>No scheduled payments found.</p>
                  <p style={{ fontSize: '14px' }}>
                    Add recurring payments to see your forecast here!
                  </p>
                </div>
              ) : (
                activeDays.map((day, idx) => (
                  <div
                    key={day.date}
                    style={{
                      borderBottom: idx < activeDays.length - 1 ? '1px solid #f3f4f6' : 'none',
                    }}
                  >
                    {/* Date Header */}
                    <div style={{
                      padding: '12px 20px',
                      background: criticalDates.some(c => c.date === day.date) ? '#fffbeb' : '#f9fafb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <div style={{ fontWeight: '600', fontSize: '14px' }}>
                        {formatDate(day.date)}
                        {criticalDates.some(c => c.date === day.date) && (
                          <span style={{ marginLeft: '8px' }}>⚡</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '15px', fontSize: '13px', alignItems: 'center' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          {day.totalIncome > 0 && (
                            <span style={{ color: '#10b981', fontWeight: '600' }}>
                              +{formatCurrency(day.totalIncome)}
                            </span>
                          )}
                          {day.totalExpenses > 0 && (
                            <span style={{ color: '#ef4444', fontWeight: '600' }}>
                              -{formatCurrency(day.totalExpenses)}
                            </span>
                          )}
                        </div>
                        <span style={{ 
                          color: day.runningBalance >= 0 ? '#667eea' : '#ef4444',
                          fontWeight: '500',
                        }}>
                          → {formatCurrency(day.runningBalance)}
                        </span>
                        <span style={{ 
                          color: '#d1d5db',
                          margin: '0 5px',
                        }}>|</span>
                        <span style={{ 
                          color: (() => {
                            // Calculate cumulative change from starting balance
                            // This ensures the last day's cumulative change matches the "Net Change" at the top
                            const cumulativeChange = day.runningBalance - baselineBalance;
                            return cumulativeChange >= 0 ? '#10b981' : '#ef4444';
                          })(),
                          fontWeight: '600',
                          fontSize: '14px',
                        }}>
                          {(() => {
                            // Calculate cumulative change from starting balance
                            const cumulativeChange = day.runningBalance - baselineBalance;
                            return (cumulativeChange >= 0 ? '+' : '') + formatCurrency(cumulativeChange);
                          })()}
                        </span>
                      </div>
                    </div>
                    
                    {/* Payments List */}
                    <div style={{ padding: '10px 20px' }}>
                      {[...day.income, ...day.expenses].map((payment, pIdx) => (
                        <div
                          key={`${payment.id}-${pIdx}`}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 0',
                            borderBottom: pIdx < day.income.length + day.expenses.length - 1 
                              ? '1px solid #f3f4f6' 
                              : 'none',
                          }}
                          onMouseEnter={() => payment.isVariable && setHoveredPayment(`${payment.id}-${day.date}`)}
                          onMouseLeave={() => setHoveredPayment(null)}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              background: payment.category === 'Income' ? '#dcfce7' : 
                                         payment.category === 'Subscription' ? '#e0e7ff' :
                                         payment.category === 'Bill' ? '#fef3c7' : '#fee2e2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: '16px',
                            }}>
                              {payment.category === 'Income' && '💵'}
                              {payment.category === 'Subscription' && '📺'}
                              {payment.category === 'Bill' && '📄'}
                              {payment.category === 'Credit Card' && '💳'}
                            </div>
                            <div>
                              <div style={{ fontWeight: '500', fontSize: '14px' }}>
                                {payment.name}
                                {payment.isVariable && (
                                  <span 
                                    style={{ 
                                      marginLeft: '6px', 
                                      fontSize: '11px',
                                      color: '#667eea',
                                      cursor: 'help',
                                    }}
                                    title={`Range: ${formatCurrency(payment.amountMin)} - ${formatCurrency(payment.amountMax)}`}
                                  >
                                    📊
                                  </span>
                                )}
                              </div>
                              <div style={{ fontSize: '12px', color: '#6b7280' }}>
                                {payment.category} • {payment.frequency}
                              </div>
                            </div>
                          </div>
                          
                          <div style={{ textAlign: 'right', position: 'relative' }}>
                            <div style={{
                              fontWeight: '600',
                              fontSize: '15px',
                              color: payment.category === 'Income' ? '#10b981' : '#111827',
                            }}>
                              {payment.category === 'Income' ? '+' : '-'}{formatCurrency(payment.amount)}
                            </div>
                            
                            {/* Tooltip for variable amounts */}
                            {payment.isVariable && hoveredPayment === `${payment.id}-${day.date}` && (
                              <div style={{
                                position: 'absolute',
                                right: 0,
                                top: '100%',
                                marginTop: '5px',
                                padding: '8px 12px',
                                background: '#1f2937',
                                color: 'white',
                                borderRadius: '6px',
                                fontSize: '12px',
                                whiteSpace: 'nowrap',
                                zIndex: 10,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                              }}>
                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                                  Amount Range
                                </div>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                  <span>Low: {formatCurrency(payment.amountMin || payment.amount)}</span>
                                  <span>|</span>
                                  <span>High: {formatCurrency(payment.amountMax || payment.amount)}</span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

