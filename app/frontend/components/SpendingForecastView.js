'use client';

import { useState, useEffect, useMemo } from 'react';
import { useAuth } from './auth/AuthContext';

// Hook to detect mobile screen size
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  return isMobile;
}

export default function SpendingForecastView() {
  const [forecast, setForecast] = useState(null);
  const [dailyProjections, setDailyProjections] = useState([]);
  const [criticalDates, setCriticalDates] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [daysToForecast, setDaysToForecast] = useState(30);
  const [viewMode, setViewMode] = useState('fromNow'); // 'fromNow' or 'monthly'
  const [selectedMonth, setSelectedMonth] = useState(() => {
    // Initialize to current month
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [monthsToView, setMonthsToView] = useState(1); // 1, 2, 3, 6, 12, 24
  const [customBalance, setCustomBalance] = useState('');
  const [minimumBalance, setMinimumBalance] = useState(1000); // Minimum balance to maintain
  const [forecastMode, setForecastMode] = useState('average'); // 'average' or 'max'
  const [showWhatIf, setShowWhatIf] = useState(false);
  const [hoveredPayment, setHoveredPayment] = useState(null);
  const [selectedDay, setSelectedDay] = useState(null);
  const [selectedDayPosition, setSelectedDayPosition] = useState({ x: 0, y: 0 });
  const [serverToday, setServerToday] = useState(null);
  const { token } = useAuth();
  const isMobile = useIsMobile();

  const fetchForecast = async (startBalance = null) => {
    try {
      setLoading(true);
      setError(null);
      
      // Calculate days based on view mode
      let daysToFetch = daysToForecast;
      if (viewMode === 'monthly') {
        // For monthly view, fetch enough days to cover the selected month range
        // Calculate days from today to end of last month in range
        const today = serverToday ? parseLocalDate(serverToday) : new Date();
        today.setHours(0, 0, 0, 0);
        const monthEnd = new Date(selectedMonth.year, selectedMonth.month + monthsToView, 0); // Last day of last month in range
        monthEnd.setHours(0, 0, 0, 0);
        const daysFromToday = Math.ceil((monthEnd - today) / (1000 * 60 * 60 * 24));
        
        // Always fetch enough days to reach the end of the selected month range
        // This will include the previous month's last day if it's after today
        // Fetch at least 90 days to ensure we have enough data, or more for longer ranges
        daysToFetch = Math.max(daysFromToday + 1, Math.max(90, monthsToView * 35));
      }
      
      let url = `/api/plaid/spending-forecast?days=${daysToFetch}`;
      if (startBalance) {
        url += `&startBalance=${startBalance}`;
      }
      if (forecastMode === 'max') {
        url += `&useMax=true`;
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
        // Store server's "today" to ensure consistent date calculations
        // This prevents timezone mismatches between server and client
        if (data.serverToday) {
          setServerToday(data.serverToday);
        }
        
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
  }, [token, daysToForecast, viewMode, selectedMonth, monthsToView, forecastMode]);

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

  // Get period description for display
  const getPeriodDescription = () => {
    if (viewMode === 'monthly') {
      const firstMonth = new Date(selectedMonth.year, selectedMonth.month, 1);
      const lastMonth = new Date(selectedMonth.year, selectedMonth.month + monthsToView - 1, 1);
      
      if (monthsToView === 1) {
        return firstMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      } else {
        const firstMonthName = firstMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        const lastMonthName = lastMonth.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        return `${firstMonthName} - ${lastMonthName}`;
      }
    }
    if (daysToForecast === 7) return '1 week';
    if (daysToForecast === 14) return '2 weeks';
    return `${daysToForecast} days`;
  };

  // Navigate to previous month
  const goToPreviousMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 0) {
        return { year: prev.year - 1, month: 11 };
      }
      return { year: prev.year, month: prev.month - 1 };
    });
  };

  // Navigate to next month
  const goToNextMonth = () => {
    setSelectedMonth(prev => {
      if (prev.month === 11) {
        return { year: prev.year + 1, month: 0 };
      }
      return { year: prev.year, month: prev.month + 1 };
    });
  };

  // Get first and last day of selected month range
  const getMonthBounds = () => {
    const firstDay = new Date(selectedMonth.year, selectedMonth.month, 1);
    // Calculate last day based on number of months to view
    const lastDay = new Date(selectedMonth.year, selectedMonth.month + monthsToView, 0);
    return {
      firstDay: formatLocalDate(firstDay),
      lastDay: formatLocalDate(lastDay),
    };
  };

  // Check if selected month is the current month (first month in range)
  const isCurrentMonth = () => {
    const today = serverToday ? parseLocalDate(serverToday) : new Date();
    return selectedMonth.year === today.getFullYear() && 
           selectedMonth.month === today.getMonth();
  };

  // Get the last day of the previous month
  const getPreviousMonthLastDay = () => {
    const prevMonth = new Date(selectedMonth.year, selectedMonth.month, 0); // Day 0 = last day of previous month
    return formatLocalDate(prevMonth);
  };

  // Check if selected month range includes the current month
  const includesCurrentMonth = () => {
    const today = serverToday ? parseLocalDate(serverToday) : new Date();
    const currentYear = today.getFullYear();
    const currentMonth = today.getMonth();
    
    for (let i = 0; i < monthsToView; i++) {
      const checkMonth = new Date(selectedMonth.year, selectedMonth.month + i, 1);
      if (checkMonth.getFullYear() === currentYear && checkMonth.getMonth() === currentMonth) {
        return true;
      }
    }
    return false;
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

  // Compute chart bars - daily for short periods, weekly for 120+ day fromNow periods
  const chartBars = useMemo(() => {
    if (!dailyProjections.length) return [];

    let filtered;
    if (viewMode === 'monthly') {
      const { firstDay, lastDay } = getMonthBounds();
      filtered = dailyProjections.filter(d => d.date >= firstDay && d.date <= lastDay);
    } else {
      const todayDate = serverToday ? parseLocalDate(serverToday) : new Date();
      todayDate.setHours(0, 0, 0, 0);
      filtered = dailyProjections.filter(day => {
        const dayDate = parseLocalDate(day.date);
        const daysDiff = Math.floor((dayDate - todayDate) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff <= daysToForecast;
      });
    }

    // For long fromNow periods, aggregate daily bars into weekly bars
    if (viewMode === 'fromNow' && daysToForecast >= 120) {
      const weeks = [];
      for (let i = 0; i < filtered.length; i += 7) {
        const weekDays = filtered.slice(i, Math.min(i + 7, filtered.length));
        const lastDay = weekDays[weekDays.length - 1];
        weeks.push({
          date: lastDay.date,
          runningBalance: lastDay.runningBalance,
          income: weekDays.flatMap(d => d.income),
          expenses: weekDays.flatMap(d => d.expenses),
        });
      }
      return weeks;
    }

    return filtered;
  }, [dailyProjections, daysToForecast, viewMode, serverToday, selectedMonth, monthsToView]);

  // Get days with activity (expenses or income) within the forecast period
  const activeDays = useMemo(() => {
    if (viewMode === 'monthly') {
      // For monthly mode, show all days in the selected month with activity
      const { firstDay, lastDay } = getMonthBounds();
      const daysWithActivity = dailyProjections.filter(d => {
        return d.date >= firstDay && d.date <= lastDay && (d.expenses.length > 0 || d.income.length > 0);
      });
      
      // Always include the first day of the month if it exists, even if it has no activity
      const firstDayInMonth = dailyProjections.find(d => d.date === firstDay);
      if (firstDayInMonth && !daysWithActivity.find(d => d.date === firstDay)) {
        daysWithActivity.unshift(firstDayInMonth);
      }
      
      // Always include the last day of the month if it exists, even if it has no activity
      const lastDayInMonth = dailyProjections.find(d => d.date === lastDay);
      if (lastDayInMonth && !daysWithActivity.find(d => d.date === lastDay)) {
        daysWithActivity.push(lastDayInMonth);
      }
      
      // Sort by date to ensure proper order
      return daysWithActivity.sort((a, b) => a.date.localeCompare(b.date));
    }
    
    // For "From Now" mode, use existing logic
    // Use server's "today" if available, otherwise fall back to client's today
    // This ensures consistent date calculations across environments
    const todayDate = serverToday ? parseLocalDate(serverToday) : new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    // Filter days with activity
    // Include days from today (daysDiff = 0) through daysToForecast (inclusive)
    // So for 30 days: days 0-30 (31 days total, including today)
    const daysWithActivity = dailyProjections.filter(d => {
      // Use parseLocalDate to avoid timezone issues
      const dayDate = parseLocalDate(d.date);
      dayDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((dayDate - todayDate) / (1000 * 60 * 60 * 24));
      // Include today (daysDiff === 0) through day daysToForecast (inclusive)
      return daysDiff >= 0 && daysDiff <= daysToForecast && (d.expenses.length > 0 || d.income.length > 0);
    });
    
    // Always include the last day of the forecast period, even if it has no activity
    // This ensures the cumulative change matches the "Net Change" at the top
    const lastDay = dailyProjections[dailyProjections.length - 1];
    if (lastDay && !daysWithActivity.find(d => d.date === lastDay.date)) {
      // Check if last day is within the forecast window
      const lastDayDate = parseLocalDate(lastDay.date);
      lastDayDate.setHours(0, 0, 0, 0);
      const daysDiff = Math.floor((lastDayDate - todayDate) / (1000 * 60 * 60 * 24));
      // Include if it's within the forecast period (inclusive)
      if (daysDiff >= 0 && daysDiff <= daysToForecast) {
        daysWithActivity.push(lastDay);
      }
    }
    
    return daysWithActivity;
  }, [dailyProjections, daysToForecast, viewMode, serverToday, selectedMonth]);
  
  // Calculate baseline balance from the first day in the upcoming payments list
  // This ensures the cumulative change shows the change from the beginning of the visible period
  // The last day's cumulative change will then match the total change across the visible period
  const baselineBalance = useMemo(() => {
    if (viewMode === 'monthly') {
      // For monthly mode, check if the range includes the current month or starts in the future
      if (includesCurrentMonth()) {
        // Current month: use the balance at the start of the month (day before first day)
        const { firstDay } = getMonthBounds();
        const firstDayIndex = dailyProjections.findIndex(d => d.date === firstDay);
        
        if (firstDayIndex >= 0 && firstDayIndex > 0) {
          // Use the running balance of the day BEFORE the first day of the month
          return dailyProjections[firstDayIndex - 1].runningBalance;
        } else if (firstDayIndex === 0) {
          // First day of month is the first day in projections, use starting balance
          return forecast?.startingBalance || 0;
        } else {
          // Month starts before projections, use starting balance
          return forecast?.startingBalance || 0;
        }
      } else {
        // Future month: use the ending balance from the previous month
        const previousMonthLastDay = getPreviousMonthLastDay();
        const previousMonthLastDayData = dailyProjections.find(d => d.date === previousMonthLastDay);
        
        if (previousMonthLastDayData) {
          // Use the running balance from the last day of the previous month
          return previousMonthLastDayData.runningBalance;
        } else {
          // Previous month not in projections, try to find the day before the first day of selected month
          const { firstDay } = getMonthBounds();
          const firstDayIndex = dailyProjections.findIndex(d => d.date === firstDay);
          
          if (firstDayIndex >= 0 && firstDayIndex > 0) {
            return dailyProjections[firstDayIndex - 1].runningBalance;
          } else {
            // Fallback to starting balance
            return forecast?.startingBalance || 0;
          }
        }
      }
    }
    
    // For "From Now" mode, use existing logic
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
  }, [activeDays, dailyProjections, forecast, viewMode, selectedMonth, monthsToView, serverToday]);

  // Calculate net change for the visible period (month range or days)
  // Use the same calculation method for both views: sum daily net changes
  const visibleNetChange = useMemo(() => {
    if (!forecast || !dailyProjections.length) return 0;
    
    if (viewMode === 'monthly') {
      // For monthly mode, sum up all daily net changes in the selected month range
      const { firstDay, lastDay } = getMonthBounds();
      const netChange = dailyProjections
        .filter(d => d.date >= firstDay && d.date <= lastDay)
        .reduce((sum, d) => sum + (d.netChange || 0), 0);
      
      return netChange;
    }
    
    // For "From Now" mode, sum daily net changes for the selected period
    // This ensures consistency with monthly mode
    const todayDate = serverToday ? parseLocalDate(serverToday) : new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    const netChange = dailyProjections
      .filter(d => {
        const dayDate = parseLocalDate(d.date);
        dayDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((dayDate - todayDate) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff <= daysToForecast;
      })
      .reduce((sum, d) => sum + (d.netChange || 0), 0);
    
    return netChange;
  }, [forecast, dailyProjections, viewMode, selectedMonth, monthsToView, daysToForecast, serverToday]);

  // Calculate total income and expenses for visible period
  // Use the same calculation method for both views: sum daily values
  const visibleIncome = useMemo(() => {
    if (viewMode === 'monthly') {
      const { firstDay, lastDay } = getMonthBounds();
      return dailyProjections
        .filter(d => d.date >= firstDay && d.date <= lastDay)
        .reduce((sum, d) => sum + d.totalIncome, 0);
    }
    
    // For "From Now" mode, sum daily income for the selected period
    const todayDate = serverToday ? parseLocalDate(serverToday) : new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    return dailyProjections
      .filter(d => {
        const dayDate = parseLocalDate(d.date);
        dayDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((dayDate - todayDate) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff <= daysToForecast;
      })
      .reduce((sum, d) => sum + d.totalIncome, 0);
  }, [dailyProjections, viewMode, selectedMonth, monthsToView, daysToForecast, serverToday]);

  const visibleExpenses = useMemo(() => {
    if (viewMode === 'monthly') {
      const { firstDay, lastDay } = getMonthBounds();
      return dailyProjections
        .filter(d => d.date >= firstDay && d.date <= lastDay)
        .reduce((sum, d) => sum + d.totalExpenses, 0);
    }
    
    // For "From Now" mode, sum daily expenses for the selected period
    const todayDate = serverToday ? parseLocalDate(serverToday) : new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    return dailyProjections
      .filter(d => {
        const dayDate = parseLocalDate(d.date);
        dayDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((dayDate - todayDate) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff <= daysToForecast;
      })
      .reduce((sum, d) => sum + d.totalExpenses, 0);
  }, [dailyProjections, viewMode, selectedMonth, monthsToView, daysToForecast, serverToday]);

  // Calculate ending balance for the visible period
  // Use the same calculation method for both views: baseline + net change
  const visibleEndingBalance = useMemo(() => {
    if (!forecast || !dailyProjections.length) return forecast?.endingBalance || 0;
    
    // For both modes, calculate as: baseline balance + net change for the period
    return baselineBalance + visibleNetChange;
  }, [baselineBalance, visibleNetChange]);

  // Calculate lowest balance in the visible period
  const visibleLowestBalance = useMemo(() => {
    if (!dailyProjections.length) return baselineBalance;
    
    if (viewMode === 'monthly') {
      const { firstDay, lastDay } = getMonthBounds();
      const balances = dailyProjections
        .filter(d => d.date >= firstDay && d.date <= lastDay)
        .map(d => d.runningBalance);
      return balances.length > 0 ? Math.min(...balances, baselineBalance) : baselineBalance;
    }
    
    // For "From Now" mode, find lowest balance in the period
    const todayDate = serverToday ? parseLocalDate(serverToday) : new Date();
    todayDate.setHours(0, 0, 0, 0);
    
    const balances = dailyProjections
      .filter(d => {
        const dayDate = parseLocalDate(d.date);
        dayDate.setHours(0, 0, 0, 0);
        const daysDiff = Math.floor((dayDate - todayDate) / (1000 * 60 * 60 * 24));
        return daysDiff >= 0 && daysDiff <= daysToForecast;
      })
      .map(d => d.runningBalance);
    
    return balances.length > 0 ? Math.min(...balances, baselineBalance) : baselineBalance;
  }, [dailyProjections, viewMode, selectedMonth, monthsToView, daysToForecast, serverToday, baselineBalance]);

  // Calculate safe amount to remove (for savings, etc.)
  // This is the lowest balance minus the minimum balance threshold
  const safeAmountToRemove = useMemo(() => {
    const safeAmount = visibleLowestBalance - minimumBalance;
    return Math.max(0, safeAmount); // Don't allow negative values
  }, [visibleLowestBalance, minimumBalance]);

  if (loading && !forecast) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '24px', marginBottom: '10px' }}>🔮</div>
        <p style={{ color: '#6b7280' }}>Consulting the shrimp oracle...</p>
      </div>
    );
  }

  return (
    <div style={{ 
      padding: isMobile ? '15px 10px' : '20px', 
      maxWidth: '1400px', 
      margin: '0 auto' 
    }}>
      {/* Header */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: isMobile ? 'flex-start' : 'center', 
        marginBottom: isMobile ? '15px' : '20px', 
        flexWrap: 'wrap', 
        gap: isMobile ? '12px' : '15px',
        flexDirection: isMobile ? 'column' : 'row',
      }}>
        <div style={{ width: isMobile ? '100%' : 'auto' }}>
          <h2 style={{ 
            margin: 0, 
            fontSize: isMobile ? '20px' : '24px', 
            fontWeight: '600', 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px' 
          }}>
            <span>🔮</span> Spending Forecast
          </h2>
          <p style={{ 
            margin: '5px 0 0', 
            color: '#6b7280', 
            fontSize: isMobile ? '13px' : '14px' 
          }}>
            See into your financial future
          </p>
        </div>
        
        <div style={{ 
          display: 'flex', 
          gap: isMobile ? '8px' : '10px', 
          alignItems: 'center', 
          flexWrap: 'wrap',
          width: isMobile ? '100%' : 'auto',
        }}>
          {/* Forecast Mode Toggle (Average vs Max) */}
          <div style={{ 
            display: 'flex', 
            gap: '4px', 
            background: '#f3f4f6', 
            padding: '4px', 
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            flex: isMobile ? '1 1 auto' : '0 0 auto',
            minWidth: isMobile ? '0' : 'auto',
          }}>
            <button
              onClick={() => setForecastMode('average')}
              style={{
                padding: isMobile ? '8px 10px' : '6px 12px',
                background: forecastMode === 'average' ? 'white' : 'transparent',
                color: forecastMode === 'average' ? '#667eea' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: forecastMode === 'average' ? '600' : '400',
                boxShadow: forecastMode === 'average' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s',
                flex: '1',
                minWidth: '0',
              }}
              title="Use average spending amounts"
            >
              {isMobile ? 'Avg' : 'Average'}
            </button>
            <button
              onClick={() => setForecastMode('max')}
              style={{
                padding: isMobile ? '8px 10px' : '6px 12px',
                background: forecastMode === 'max' ? 'white' : 'transparent',
                color: forecastMode === 'max' ? '#667eea' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: forecastMode === 'max' ? '600' : '400',
                boxShadow: forecastMode === 'max' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s',
                flex: '1',
                minWidth: '0',
              }}
              title="Use maximum spending amounts (most conservative)"
            >
              Max
            </button>
          </div>
          
          {/* View Mode Toggle */}
          <div style={{ 
            display: 'flex', 
            gap: '4px', 
            background: '#f3f4f6', 
            padding: '4px', 
            borderRadius: '8px',
            border: '1px solid #e5e7eb',
            flex: isMobile ? '1 1 auto' : '0 0 auto',
            minWidth: isMobile ? '0' : 'auto',
          }}>
            <button
              onClick={() => {
                setViewMode('fromNow');
              }}
              style={{
                padding: isMobile ? '8px 10px' : '6px 12px',
                background: viewMode === 'fromNow' ? 'white' : 'transparent',
                color: viewMode === 'fromNow' ? '#667eea' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: viewMode === 'fromNow' ? '600' : '400',
                boxShadow: viewMode === 'fromNow' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s',
                flex: '1',
                minWidth: '0',
              }}
            >
              {isMobile ? 'Now' : 'From Now'}
            </button>
            <button
              onClick={() => {
                setViewMode('monthly');
                // Reset to current month when switching to monthly mode
                const now = new Date();
                setSelectedMonth({ year: now.getFullYear(), month: now.getMonth() });
              }}
              style={{
                padding: isMobile ? '8px 10px' : '6px 12px',
                background: viewMode === 'monthly' ? 'white' : 'transparent',
                color: viewMode === 'monthly' ? '#667eea' : '#6b7280',
                border: 'none',
                borderRadius: '6px',
                cursor: 'pointer',
                fontSize: isMobile ? '12px' : '13px',
                fontWeight: viewMode === 'monthly' ? '600' : '400',
                boxShadow: viewMode === 'monthly' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 0.2s',
                flex: '1',
                minWidth: '0',
              }}
            >
              Monthly
            </button>
          </div>
          
          {/* Period Selector */}
          {viewMode === 'fromNow' ? (
          <select
            value={daysToForecast}
            onChange={(e) => {
              setDaysToForecast(parseInt(e.target.value));
              fetchForecast();
            }}
            style={{
              padding: isMobile ? '10px 12px' : '8px 12px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              fontSize: isMobile ? '13px' : '14px',
              background: 'white',
              flex: isMobile ? '1 1 auto' : '0 0 auto',
              minWidth: isMobile ? '0' : 'auto',
            }}
          >
              <option value={7}>1 week</option>
              <option value={14}>2 weeks</option>
            <option value={30}>30 days</option>
            <option value={60}>60 days</option>
            <option value={90}>90 days</option>
            <option value={120}>120 days</option>
            <option value={240}>240 days</option>
            <option value={360}>360 days</option>
          </select>
          ) : (
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: isMobile ? '6px' : '10px', 
              flexWrap: 'wrap',
              width: isMobile ? '100%' : 'auto',
            }}>
              <select
                value={monthsToView}
                onChange={(e) => {
                  setMonthsToView(parseInt(e.target.value));
                }}
                style={{
                  padding: isMobile ? '10px 12px' : '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: isMobile ? '13px' : '14px',
                  background: 'white',
                  flex: isMobile ? '1 1 auto' : '0 0 auto',
                  minWidth: isMobile ? '0' : 'auto',
                }}
              >
                <option value={1}>1 month</option>
                <option value={2}>2 months</option>
                <option value={3}>3 months</option>
                <option value={6}>6 months</option>
                <option value={12}>12 months</option>
                <option value={24}>24 months</option>
              </select>
              <button
                onClick={goToPreviousMonth}
                style={{
                  padding: isMobile ? '10px' : '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: isMobile ? '18px' : '16px',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  minWidth: isMobile ? '44px' : 'auto',
                  minHeight: isMobile ? '44px' : 'auto',
                }}
                title="Previous period"
              >
                ←
              </button>
              <div style={{
                padding: isMobile ? '10px 12px' : '8px 16px',
                border: '1px solid #d1d5db',
                borderRadius: '6px',
                fontSize: isMobile ? '12px' : '14px',
                background: 'white',
                fontWeight: '600',
                minWidth: isMobile ? '0' : '200px',
                textAlign: 'center',
                flex: isMobile ? '1 1 auto' : '0 0 auto',
              }}>
                {getPeriodDescription()}
              </div>
              <button
                onClick={goToNextMonth}
                style={{
                  padding: isMobile ? '10px' : '8px 12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '6px',
                  fontSize: isMobile ? '18px' : '16px',
                  background: 'white',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  minWidth: isMobile ? '44px' : 'auto',
                  minHeight: isMobile ? '44px' : 'auto',
                }}
                title="Next period"
              >
                →
              </button>
            </div>
          )}
          
          <button
            onClick={() => setShowWhatIf(!showWhatIf)}
            style={{
              padding: isMobile ? '10px 14px' : '8px 16px',
              background: showWhatIf ? '#667eea' : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: isMobile ? '13px' : '14px',
              fontWeight: '500',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              flex: isMobile ? '1 1 auto' : '0 0 auto',
              minWidth: isMobile ? '0' : 'auto',
            }}
          >
            <span>✨</span> {isMobile ? 'What If' : 'What If...?'}
          </button>
          
          <button
            onClick={() => fetchForecast()}
            disabled={loading}
            style={{
              padding: isMobile ? '10px 14px' : '8px 16px',
              background: loading ? '#9ca3af' : '#10b981',
              color: 'white',
              border: 'none',
              borderRadius: '6px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: isMobile ? '13px' : '14px',
              fontWeight: '500',
              flex: isMobile ? '1 1 auto' : '0 0 auto',
              minWidth: isMobile ? '0' : 'auto',
            }}
          >
            {loading ? 'Loading...' : isMobile ? '🔄' : '🔄 Refresh'}
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
          padding: isMobile ? '15px' : '20px',
          background: 'linear-gradient(135deg, #f0f4ff 0%, #e8f0fe 100%)',
          border: '2px solid #667eea',
          borderRadius: '12px',
          marginBottom: isMobile ? '15px' : '20px',
        }}>
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: '10px', 
            marginBottom: '15px',
            flexDirection: isMobile ? 'column' : 'row',
            alignItems: isMobile ? 'flex-start' : 'center',
          }}>
            <span style={{ fontSize: isMobile ? '20px' : '24px' }}>🦐</span>
            <div style={{ flex: 1 }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: isMobile ? '14px' : '16px', 
                fontWeight: '600', 
                color: '#4338ca' 
              }}>
                What If I Had Different Money?
              </h3>
              <p style={{ 
                margin: '4px 0 0', 
                fontSize: isMobile ? '12px' : '13px', 
                color: '#6366f1' 
              }}>
                Imagine the possibilities! Enter a custom starting balance to see how your forecast changes.
              </p>
            </div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            gap: isMobile ? '8px' : '10px', 
            alignItems: 'center', 
            flexWrap: 'wrap',
            flexDirection: isMobile ? 'column' : 'row',
          }}>
            <div style={{ 
              position: 'relative',
              width: isMobile ? '100%' : 'auto',
            }}>
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
                  padding: isMobile ? '12px 12px 12px 24px' : '10px 12px 10px 24px',
                  border: '2px solid #667eea',
                  borderRadius: '8px',
                  fontSize: isMobile ? '16px' : '16px',
                  width: isMobile ? '100%' : '180px',
                  fontWeight: '600',
                }}
              />
            </div>
            
            <button
              onClick={handleWhatIfApply}
              disabled={!customBalance}
              style={{
                padding: isMobile ? '12px 16px' : '10px 20px',
                background: customBalance ? '#667eea' : '#d1d5db',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: customBalance ? 'pointer' : 'not-allowed',
                fontSize: isMobile ? '13px' : '14px',
                fontWeight: '600',
                width: isMobile ? '100%' : 'auto',
              }}
            >
              ✨ {isMobile ? 'Show Future' : 'Show Me The Future!'}
            </button>
            
            <button
              onClick={handleWhatIfReset}
              style={{
                padding: isMobile ? '12px 16px' : '10px 20px',
                background: 'white',
                color: '#667eea',
                border: '2px solid #667eea',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: isMobile ? '13px' : '14px',
                fontWeight: '500',
                width: isMobile ? '100%' : 'auto',
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
            gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: isMobile ? '12px' : '15px',
            marginBottom: isMobile ? '20px' : '30px',
          }}>
            <div style={{
              padding: isMobile ? '16px' : '20px',
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ 
                fontSize: isMobile ? '12px' : '13px', 
                opacity: 0.9, 
                marginBottom: '5px' 
              }}>
                Starting Balance
              </div>
              <div style={{ 
                fontSize: isMobile ? '24px' : '28px', 
                fontWeight: '700',
                wordBreak: 'break-word',
              }}>
                {formatCurrency(
                  viewMode === 'monthly' && !includesCurrentMonth() 
                    ? baselineBalance 
                    : forecast.startingBalance
                )}
              </div>
              <div style={{ 
                fontSize: isMobile ? '11px' : '12px', 
                opacity: 0.8, 
                marginTop: '5px' 
              }}>
                {viewMode === 'monthly' && !includesCurrentMonth() 
                  ? (() => {
                      const prevMonthDate = new Date(selectedMonth.year, selectedMonth.month, 0);
                      const prevMonthName = prevMonthDate.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
                      return `From end of ${prevMonthName}`;
                    })()
                  : `${accounts.length} account${accounts.length !== 1 ? 's' : ''}`
                }
              </div>
            </div>
            
            <div style={{
              padding: isMobile ? '16px' : '20px',
              background: visibleEndingBalance >= 0 
                ? 'linear-gradient(135deg, #10b981 0%, #059669 100%)'
                : 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ 
                fontSize: isMobile ? '12px' : '13px', 
                opacity: 0.9, 
                marginBottom: '5px' 
              }}>
                Projected End Balance
              </div>
              <div style={{ 
                fontSize: isMobile ? '24px' : '28px', 
                fontWeight: '700',
                wordBreak: 'break-word',
              }}>
                {formatCurrency(visibleEndingBalance)}
              </div>
              <div style={{ 
                fontSize: isMobile ? '11px' : '12px', 
                opacity: 0.8, 
                marginTop: '5px' 
              }}>
                {viewMode === 'monthly' 
                  ? (monthsToView === 1 
                      ? `End of ${getPeriodDescription()}`
                      : `Through ${getPeriodDescription()}`
                    )
                  : `After ${getPeriodDescription()}`
                }
              </div>
            </div>
            
            <div style={{
              padding: isMobile ? '16px' : '20px',
              background: forecast.lowestBalance >= 0 
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ 
                fontSize: isMobile ? '12px' : '13px', 
                opacity: 0.9, 
                marginBottom: '5px' 
              }}>
                Lowest Point
              </div>
              <div style={{ 
                fontSize: isMobile ? '24px' : '28px', 
                fontWeight: '700',
                wordBreak: 'break-word',
              }}>
                {formatCurrency(forecast.lowestBalance)}
              </div>
              <div style={{ 
                fontSize: isMobile ? '11px' : '12px', 
                opacity: 0.8, 
                marginTop: '5px' 
              }}>
                on {formatDate(forecast.lowestBalanceDate)}
              </div>
            </div>
            
            <div style={{
              padding: isMobile ? '16px' : '20px',
              background: '#f9fafb',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
            }}>
              <div style={{ 
                fontSize: isMobile ? '12px' : '13px', 
                color: '#6b7280', 
                marginBottom: '5px' 
              }}>
                Net Change
              </div>
              <div style={{ 
                fontSize: isMobile ? '24px' : '28px', 
                fontWeight: '700',
                color: visibleNetChange >= 0 ? '#10b981' : '#ef4444',
                wordBreak: 'break-word',
              }}>
                {visibleNetChange >= 0 ? '+' : ''}{formatCurrency(visibleNetChange)}
              </div>
              <div style={{ 
                fontSize: isMobile ? '11px' : '12px', 
                color: '#6b7280', 
                marginTop: '5px' 
              }}>
                {formatCurrency(visibleIncome)} in / {formatCurrency(visibleExpenses)} out
              </div>
            </div>
            
            <div style={{
              padding: isMobile ? '16px' : '20px',
              background: safeAmountToRemove > 0 
                ? 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)'
                : 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              borderRadius: '12px',
              color: 'white',
            }}>
              <div style={{ 
                fontSize: isMobile ? '12px' : '13px', 
                opacity: 0.9, 
                marginBottom: '5px' 
              }}>
                Safe to Remove
              </div>
              <div style={{ 
                fontSize: isMobile ? '24px' : '28px', 
                fontWeight: '700',
                wordBreak: 'break-word',
              }}>
                {formatCurrency(safeAmountToRemove)}
              </div>
              <div style={{ 
                fontSize: isMobile ? '11px' : '12px', 
                opacity: 0.8, 
                marginTop: '5px' 
              }}>
                {safeAmountToRemove > 0 
                  ? `Maintain ${formatCurrency(minimumBalance)} minimum`
                  : `Lowest: ${formatCurrency(visibleLowestBalance)}`
                }
              </div>
              <div style={{ 
                marginTop: '10px', 
                fontSize: isMobile ? '10px' : '11px', 
                opacity: 0.9,
                display: 'flex',
                flexDirection: isMobile ? 'column' : 'row',
                gap: isMobile ? '6px' : '8px',
                alignItems: isMobile ? 'flex-start' : 'center',
              }}>
                <input
                  type="number"
                  value={minimumBalance}
                  onChange={(e) => setMinimumBalance(Math.max(0, parseFloat(e.target.value) || 0))}
                  placeholder="1000"
                  style={{
                    width: isMobile ? '100%' : '80px',
                    padding: isMobile ? '6px 8px' : '4px 8px',
                    border: '1px solid rgba(255, 255, 255, 0.3)',
                    borderRadius: '4px',
                    background: 'rgba(255, 255, 255, 0.2)',
                    color: 'white',
                    fontSize: isMobile ? '11px' : '12px',
                  }}
                />
                <span style={{ marginLeft: isMobile ? '0' : '8px' }}>min balance</span>
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
              padding: isMobile ? '15px' : '25px',
              background: 'white',
              borderRadius: '12px',
              border: '1px solid #e5e7eb',
              marginBottom: isMobile ? '20px' : '25px',
            }}>
              <h3 style={{ 
                margin: '0 0 15px', 
                fontSize: isMobile ? '16px' : '18px', 
                fontWeight: '600' 
              }}>
                💰 Balance Timeline
              </h3>
              
              <div style={{ 
                position: 'relative', 
                height: isMobile ? '150px' : '200px', 
                marginBottom: '10px',
                overflowX: isMobile ? 'auto' : 'visible',
                overflowY: 'visible',
              }}>
                {/* Y-axis labels */}
                <div style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  bottom: 20,
                  width: isMobile ? '60px' : '80px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                  fontSize: isMobile ? '9px' : '11px',
                  color: '#6b7280',
                  textAlign: 'right',
                  paddingRight: isMobile ? '6px' : '10px',
                  zIndex: 2,
                }}>
                  <span>{formatCurrency(chartData.maxBalance)}</span>
                  <span>{formatCurrency((chartData.maxBalance + chartData.minBalance) / 2)}</span>
                  <span>{formatCurrency(chartData.minBalance)}</span>
                </div>
                
                {/* Chart area */}
                <div style={{
                  position: 'absolute',
                  left: isMobile ? '65px' : '85px',
                  right: 0,
                  top: 0,
                  bottom: 20,
                  background: '#f9fafb',
                  borderRadius: '8px',
                  overflowX: isMobile ? 'auto' : 'hidden',
                  overflowY: 'hidden',
                  minWidth: isMobile ? '400px' : 'auto',
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
                    gap: daysToForecast >= 120 ? '0px' : '1px',
                    padding: '0 5px',
                  }}>
                    {chartBars.map((day, idx) => {
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
                            flex: 1,
                            minWidth: '2px',
                            height: `${Math.max(barHeight, 2)}%`,
                            position: 'relative',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                            opacity: (recurringIncome > 0 || recurringExpenses > 0 || otherExpenses > 0) ? 1 : 0.5,
                            border: isSelected ? '2px solid #667eea' : 'none',
                            boxShadow: isSelected ? '0 0 0 2px rgba(102, 126, 234, 0.2)' : 'none',
                          }}
                          title={`${viewMode === 'fromNow' && daysToForecast >= 120 ? 'Week ending ' : ''}${formatDate(day.date)}: ${formatCurrency(day.runningBalance)}\nCumulative Change: ${(() => {
                            const cumulativeChange = day.runningBalance - baselineBalance;
                            return (cumulativeChange >= 0 ? '+' : '') + formatCurrency(cumulativeChange);
                          })()}\nRecurring Income: ${formatCurrency(recurringIncome)}\nRecurring Expenses: ${formatCurrency(recurringExpenses)}\nOther Expenses: ${formatCurrency(otherExpenses)}`}
                          onMouseEnter={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.opacity = '0.8';
                              e.currentTarget.style.transform = 'scaleY(1.05)';
                            }
                          }}
                          onMouseLeave={(e) => {
                            if (!isSelected) {
                              e.currentTarget.style.opacity = (recurringIncome > 0 || recurringExpenses > 0 || otherExpenses > 0) ? 1 : 0.5;
                              e.currentTarget.style.transform = 'scaleY(1)';
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
                gap: isMobile ? '12px' : '20px',
                justifyContent: 'center',
                fontSize: isMobile ? '10px' : '12px',
                color: '#6b7280',
                flexWrap: 'wrap',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ 
                    width: isMobile ? '10px' : '12px', 
                    height: isMobile ? '10px' : '12px', 
                    background: '#10b981', 
                    borderRadius: '2px' 
                  }} />
                  <span>{isMobile ? 'Payday' : 'Payday (Recurring Income)'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ 
                    width: isMobile ? '10px' : '12px', 
                    height: isMobile ? '10px' : '12px', 
                    background: '#667eea', 
                    borderRadius: '2px' 
                  }} />
                  <span>{isMobile ? 'Recurring' : 'Recurring Expenses'}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <div style={{ 
                    width: isMobile ? '10px' : '12px', 
                    height: isMobile ? '10px' : '12px', 
                    background: '#f59e0b', 
                    borderRadius: '2px' 
                  }} />
                  <span>{isMobile ? 'Other' : 'Other Expenses'}</span>
                </div>
              </div>
            </div>
          )}

          {/* Day Details Modal/Dropdown */}
          {selectedDay && (() => {
            const modalWidth = isMobile ? window.innerWidth - 20 : 400;
            const totalItems = selectedDay.expenses.length + selectedDay.income.length;
            const modalHeight = Math.min(isMobile ? window.innerHeight - 40 : 500, 100 + totalItems * 60);
            const padding = isMobile ? 10 : 20;
            
            // Calculate position (centered above the bar, or below if not enough space)
            let left = isMobile ? padding : selectedDayPosition.x - modalWidth / 2;
            let top = isMobile ? padding : selectedDayPosition.y - modalHeight - 10; // Above the bar
            
            // Keep on screen
            if (!isMobile) {
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
                    position: isMobile ? 'fixed' : 'absolute',
                    left: isMobile ? '0' : `${left}px`,
                    top: isMobile ? '0' : `${top}px`,
                    right: isMobile ? '0' : 'auto',
                    bottom: isMobile ? '0' : 'auto',
                    width: isMobile ? '100%' : `${modalWidth}px`,
                    maxHeight: isMobile ? '100%' : `${modalHeight}px`,
                    background: 'white',
                    borderRadius: isMobile ? '0' : '12px',
                    boxShadow: isMobile ? 'none' : '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)',
                    border: isMobile ? 'none' : '2px solid #667eea',
                    overflow: 'hidden',
                    zIndex: 1001,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div style={{
                    padding: isMobile ? '14px 16px' : '16px 20px',
                    background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: 'white',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: isMobile ? '14px' : '16px' 
                      }}>
                        {parseLocalDate(selectedDay.date).toLocaleDateString('en-US', {
                          weekday: isMobile ? 'short' : 'long',
                          month: 'long',
                          day: 'numeric',
                          year: isMobile ? '2-digit' : 'numeric',
                        })}
                      </div>
                      <div style={{ 
                        fontSize: isMobile ? '11px' : '12px', 
                        opacity: 0.9, 
                        marginTop: '2px' 
                      }}>
                        Balance: {formatCurrency(selectedDay.runningBalance)}
                      </div>
                    </div>
                    <button
                      onClick={() => setSelectedDay(null)}
                      style={{
                        background: 'rgba(255, 255, 255, 0.2)',
                        border: 'none',
                        borderRadius: '6px',
                        width: isMobile ? '36px' : '28px',
                        height: isMobile ? '36px' : '28px',
                        color: 'white',
                        cursor: 'pointer',
                        fontSize: isMobile ? '24px' : '18px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      ×
                    </button>
                  </div>
                  
                  {/* Content */}
                  <div style={{
                    maxHeight: isMobile ? 'calc(100vh - 140px)' : `${modalHeight - 80}px`,
                    overflowY: 'auto',
                    padding: isMobile ? '12px' : '15px',
                  }}>
                    {/* Income */}
                    {selectedDay.income.length > 0 && (
                      <div style={{ marginBottom: '15px' }}>
                        <div style={{
                          fontSize: isMobile ? '12px' : '13px',
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
                              padding: isMobile ? '12px' : '10px 12px',
                              background: '#f0fdf4',
                              borderRadius: '6px',
                              marginBottom: '6px',
                              border: '1px solid #bbf7d0',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'flex-start',
                              flexDirection: isMobile ? 'column' : 'row',
                              gap: isMobile ? '8px' : '0',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                  fontWeight: '500', 
                                  fontSize: isMobile ? '13px' : '14px',
                                  wordBreak: 'break-word',
                                }}>
                                  {payment.name}
                                </div>
                                <div style={{ 
                                  fontSize: isMobile ? '11px' : '12px', 
                                  color: '#6b7280', 
                                  marginTop: '2px' 
                                }}>
                                  {payment.category} {payment.frequency && `• ${payment.frequency}`}
                                  {payment.source && ` • ${payment.source === 'category-spending' ? 'Weekly estimate' : payment.source}`}
                                </div>
                              </div>
                              <div style={{ 
                                fontWeight: '600', 
                                fontSize: isMobile ? '14px' : '15px', 
                                color: '#10b981',
                                flexShrink: 0,
                              }}>
                                +{formatCurrency(payment.amount)}
                              </div>
                            </div>
                            {payment.isVariable && payment.amountMin && payment.amountMax && (
                              <div style={{ 
                                fontSize: isMobile ? '10px' : '11px', 
                                color: '#6b7280', 
                                marginTop: '4px' 
                              }}>
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
                          fontSize: isMobile ? '12px' : '13px',
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
                              padding: isMobile ? '12px' : '10px 12px',
                              background: '#fef2f2',
                              borderRadius: '6px',
                              marginBottom: '6px',
                              border: '1px solid #fecaca',
                            }}
                          >
                            <div style={{ 
                              display: 'flex', 
                              justifyContent: 'space-between', 
                              alignItems: 'flex-start',
                              flexDirection: isMobile ? 'column' : 'row',
                              gap: isMobile ? '8px' : '0',
                            }}>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ 
                                  fontWeight: '500', 
                                  fontSize: isMobile ? '13px' : '14px',
                                  wordBreak: 'break-word',
                                }}>
                                  {payment.name}
                                </div>
                                <div style={{ 
                                  fontSize: isMobile ? '11px' : '12px', 
                                  color: '#6b7280', 
                                  marginTop: '2px' 
                                }}>
                                  {payment.category} {payment.frequency && `• ${payment.frequency}`}
                                  {payment.source && ` • ${payment.source === 'category-spending' ? 'Weekly estimate' : payment.source}`}
                                </div>
                              </div>
                              <div style={{ 
                                fontWeight: '600', 
                                fontSize: isMobile ? '14px' : '15px', 
                                color: '#111827',
                                flexShrink: 0,
                              }}>
                                -{formatCurrency(payment.amount)}
                              </div>
                            </div>
                            {payment.isVariable && payment.amountMin && payment.amountMax && (
                              <div style={{ 
                                fontSize: isMobile ? '10px' : '11px', 
                                color: '#6b7280', 
                                marginTop: '4px' 
                              }}>
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
                        fontSize: isMobile ? '13px' : '14px',
                      }}>
                        No transactions scheduled for this day
                      </div>
                    )}
                  </div>
                  
                  {/* Footer */}
                  <div style={{
                    padding: isMobile ? '12px 16px' : '12px 20px',
                    background: '#f9fafb',
                    borderTop: '1px solid #e5e7eb',
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: isMobile ? '12px' : '13px',
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
              padding: isMobile ? '15px' : '20px',
              background: '#fffbeb',
              border: '1px solid #fcd34d',
              borderRadius: '12px',
              marginBottom: isMobile ? '20px' : '25px',
            }}>
              <h3 style={{ 
                margin: '0 0 15px', 
                fontSize: isMobile ? '14px' : '16px', 
                fontWeight: '600', 
                color: '#92400e' 
              }}>
                ⚡ Critical Dates to Watch
              </h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {criticalDates.slice(0, 5).map((cd, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      padding: isMobile ? '12px' : '12px 15px',
                      background: 'white',
                      borderRadius: '8px',
                      border: '1px solid #fde68a',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: isMobile ? '8px' : '0',
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <div style={{ 
                        fontWeight: '600', 
                        color: '#92400e',
                        fontSize: isMobile ? '13px' : '14px',
                      }}>
                        {formatDate(cd.date)}
                      </div>
                      <div style={{ 
                        fontSize: isMobile ? '12px' : '13px', 
                        color: '#a16207' 
                      }}>
                        {cd.reason === 'negative_balance' && '⚠️ Balance goes negative!'}
                        {cd.reason === 'stacked_expenses' && `📦 ${cd.expenseCount} expenses stacked`}
                        {cd.reason === 'high_expenses' && '💸 High expense day'}
                      </div>
                    </div>
                    <div style={{ 
                      textAlign: isMobile ? 'left' : 'right',
                      flexShrink: 0,
                    }}>
                      <div style={{ 
                        fontWeight: '600', 
                        color: '#ef4444',
                        fontSize: isMobile ? '14px' : '15px',
                      }}>
                        -{formatCurrency(cd.totalExpenses)}
                      </div>
                      <div style={{ 
                        fontSize: isMobile ? '12px' : '13px', 
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
              padding: isMobile ? '15px' : '20px',
              borderBottom: '1px solid #e5e7eb',
              background: '#f9fafb',
            }}>
              <h3 style={{ 
                margin: 0, 
                fontSize: isMobile ? '16px' : '18px', 
                fontWeight: '600' 
              }}>
                📅 Upcoming Payments
              </h3>
              <p style={{ 
                margin: '5px 0 0', 
                fontSize: isMobile ? '12px' : '13px', 
                color: '#6b7280' 
              }}>
                Expenses and income for the next {getPeriodDescription()}
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
                      padding: isMobile ? '12px 15px' : '12px 20px',
                      background: criticalDates.some(c => c.date === day.date) ? '#fffbeb' : '#f9fafb',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: isMobile ? 'flex-start' : 'center',
                      flexDirection: isMobile ? 'column' : 'row',
                      gap: isMobile ? '8px' : '0',
                    }}>
                      <div style={{ 
                        fontWeight: '600', 
                        fontSize: isMobile ? '13px' : '14px' 
                      }}>
                        {formatDate(day.date)}
                        {criticalDates.some(c => c.date === day.date) && (
                          <span style={{ marginLeft: '8px' }}>⚡</span>
                        )}
                      </div>
                      <div style={{ 
                        display: 'flex', 
                        gap: isMobile ? '8px' : '15px', 
                        fontSize: isMobile ? '12px' : '13px', 
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        width: isMobile ? '100%' : 'auto',
                      }}>
                        <div style={{ 
                          display: 'flex', 
                          gap: isMobile ? '8px' : '10px', 
                          alignItems: 'center' 
                        }}>
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
                        {!isMobile && (
                          <>
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
                          </>
                        )}
                        <span style={{ 
                          color: (() => {
                            const cumulativeChange = day.runningBalance - baselineBalance;
                            return cumulativeChange >= 0 ? '#10b981' : '#ef4444';
                          })(),
                          fontWeight: '600',
                          fontSize: isMobile ? '13px' : '14px',
                        }}>
                          {isMobile ? '→ ' : ''}{formatCurrency(day.runningBalance)} ({(() => {
                            const cumulativeChange = day.runningBalance - baselineBalance;
                            return (cumulativeChange >= 0 ? '+' : '') + formatCurrency(cumulativeChange);
                          })()})
                        </span>
                      </div>
                    </div>
                    
                    {/* Payments List */}
                    <div style={{ padding: isMobile ? '10px 15px' : '10px 20px' }}>
                      {[...day.income, ...day.expenses].map((payment, pIdx) => (
                        <div
                          key={`${payment.id}-${pIdx}`}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: isMobile ? 'flex-start' : 'center',
                            padding: isMobile ? '12px 0' : '10px 0',
                            borderBottom: pIdx < day.income.length + day.expenses.length - 1 
                              ? '1px solid #f3f4f6' 
                              : 'none',
                            flexDirection: isMobile ? 'column' : 'row',
                            gap: isMobile ? '8px' : '0',
                          }}
                          onMouseEnter={() => payment.isVariable && setHoveredPayment(`${payment.id}-${day.date}`)}
                          onMouseLeave={() => setHoveredPayment(null)}
                        >
                          <div style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: isMobile ? '10px' : '12px',
                            flex: 1,
                            minWidth: 0,
                          }}>
                            <div style={{
                              width: isMobile ? '32px' : '36px',
                              height: isMobile ? '32px' : '36px',
                              borderRadius: '8px',
                              background: payment.category === 'Income' ? '#dcfce7' : 
                                         payment.category === 'Subscription' ? '#e0e7ff' :
                                         payment.category === 'Bill' ? '#fef3c7' : '#fee2e2',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: isMobile ? '14px' : '16px',
                              flexShrink: 0,
                            }}>
                              {payment.category === 'Income' && '💵'}
                              {payment.category === 'Subscription' && '📺'}
                              {payment.category === 'Bill' && '📄'}
                              {payment.category === 'Credit Card' && '💳'}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ 
                                fontWeight: '500', 
                                fontSize: isMobile ? '13px' : '14px',
                                wordBreak: 'break-word',
                              }}>
                                {payment.name}
                                {payment.isVariable && (
                                  <span 
                                    style={{ 
                                      marginLeft: '6px', 
                                      fontSize: isMobile ? '10px' : '11px',
                                      color: '#667eea',
                                      cursor: 'help',
                                    }}
                                    title={`Range: ${formatCurrency(payment.amountMin)} - ${formatCurrency(payment.amountMax)}`}
                                  >
                                    📊
                                  </span>
                                )}
                              </div>
                              <div style={{ 
                                fontSize: isMobile ? '11px' : '12px', 
                                color: '#6b7280' 
                              }}>
                                {payment.category} • {payment.frequency}
                              </div>
                            </div>
                          </div>
                          
                          <div style={{ 
                            textAlign: isMobile ? 'left' : 'right', 
                            position: 'relative',
                            flexShrink: 0,
                            width: isMobile ? '100%' : 'auto',
                          }}>
                            <div style={{
                              fontWeight: '600',
                              fontSize: isMobile ? '14px' : '15px',
                              color: payment.category === 'Income' ? '#10b981' : '#111827',
                            }}>
                              {payment.category === 'Income' ? '+' : '-'}{formatCurrency(payment.amount)}
                            </div>
                            
                            {/* Tooltip for variable amounts */}
                            {payment.isVariable && hoveredPayment === `${payment.id}-${day.date}` && (
                              <div style={{
                                position: 'absolute',
                                right: isMobile ? 'auto' : 0,
                                left: isMobile ? 0 : 'auto',
                                top: '100%',
                                marginTop: '5px',
                                padding: '8px 12px',
                                background: '#1f2937',
                                color: 'white',
                                borderRadius: '6px',
                                fontSize: isMobile ? '11px' : '12px',
                                whiteSpace: isMobile ? 'normal' : 'nowrap',
                                zIndex: 10,
                                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                                width: isMobile ? '100%' : 'auto',
                              }}>
                                <div style={{ fontWeight: '600', marginBottom: '4px' }}>
                                  Amount Range
                                </div>
                                <div style={{ 
                                  display: 'flex', 
                                  gap: '10px',
                                  flexDirection: isMobile ? 'column' : 'row',
                                }}>
                                  <span>Low: {formatCurrency(payment.amountMin || payment.amount)}</span>
                                  {!isMobile && <span>|</span>}
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

