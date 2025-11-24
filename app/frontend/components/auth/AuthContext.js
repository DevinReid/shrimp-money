'use client';

import { createContext, useContext, useState, useEffect } from 'react';

// Create context - must be defined before useAuth hook
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [mfaVerified, setMfaVerified] = useState(false);
  const [loading, setLoading] = useState(true);

  // Initialize token from localStorage on client side only
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedToken = localStorage.getItem('token');
      setToken(storedToken);
      if (storedToken) {
        verifyToken(storedToken);
      } else {
        setLoading(false);
      }
    }
  }, []);

  const verifyToken = async (tokenToVerify = null) => {
    const tokenToUse = tokenToVerify || token;
    if (!tokenToUse) {
      setLoading(false);
      return;
    }

    try {
      const response = await fetch('/api/auth/me', {
        headers: {
          'Authorization': `Bearer ${tokenToUse}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
        setMfaVerified(data.mfaVerified || false);
      } else {
        // Token invalid, clear it
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
        }
        setToken(null);
        setUser(null);
        setMfaVerified(false);
      }
    } catch (error) {
      console.error('Token verification error:', error);
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
      }
      setToken(null);
      setUser(null);
      setMfaVerified(false);
    } finally {
      setLoading(false);
    }
  };

  const login = async (username, password) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        setMfaVerified(false);
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', data.token);
        }
        return { success: true, mfaRequired: data.mfaRequired, data };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const register = async (username, password) => {
    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ username, password }),
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        setMfaVerified(false);
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', data.token);
        }
        return { success: true, data };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const verifyMFA = async (mfaToken, isLogin = false) => {
    const currentToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    try {
      const endpoint = isLogin ? '/api/auth/mfa/login' : '/api/auth/mfa/verify';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${currentToken}`,
        },
        body: JSON.stringify({ token: mfaToken }),
      });

      const data = await response.json();

      if (response.ok) {
        setToken(data.token);
        setUser(data.user);
        setMfaVerified(true);
        if (typeof window !== 'undefined') {
          localStorage.setItem('token', data.token);
        }
        return { success: true, data };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const logout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
    setToken(null);
    setUser(null);
    setMfaVerified(false);
  };

  const value = {
    user,
    token,
    mfaVerified,
    loading,
    login,
    register,
    verifyMFA,
    logout,
    verifyToken,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
