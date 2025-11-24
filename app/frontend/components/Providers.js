'use client';

import { AuthProvider } from './auth/AuthContext';

export function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

