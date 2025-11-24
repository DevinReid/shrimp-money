'use client';

import { useContext } from 'react';
import { AuthContext as AuthContextValue } from './AuthProvider';

export function useAuth() {
  const context = useContext(AuthContextValue);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
