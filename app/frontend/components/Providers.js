'use client';

import { AuthProvider } from '@/components/auth/AuthContext';

export function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

