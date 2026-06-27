'use client';

import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useAuth } from './auth/AuthContext';

const RulesContext = createContext(null);

export function RulesProvider({ children }) {
  const [rules, setRules] = useState([]);
  const [loading, setLoading] = useState(true);
  const { token } = useAuth();

  const fetchRules = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      const response = await fetch('/api/plaid/rules', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      const data = await response.json();
      if (data.rules) {
        setRules(data.rules);
      }
    } catch (err) {
      console.error('Error fetching rules:', err);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchRules();
  }, [fetchRules]);

  const refreshRules = useCallback(async () => {
    await fetchRules();
  }, [fetchRules]);

  const value = {
    rules,
    loading,
    refreshRules,
  };

  return <RulesContext.Provider value={value}>{children}</RulesContext.Provider>;
}

export function useRules() {
  const context = useContext(RulesContext);
  if (!context) {
    throw new Error('useRules must be used within a RulesProvider');
  }
  return context;
}

