'use client';

import { AuthProvider } from './auth/AuthProvider';

export function Providers({ children }) {
  return <AuthProvider>{children}</AuthProvider>;
}

