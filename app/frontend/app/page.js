'use client';

import { useAuth } from '@/components/auth/AuthContext';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PlaidApp from '@/components/PlaidApp';
import './page.css';

export default function Home() {
  return (
    <ProtectedRoute>
      <PlaidApp />
    </ProtectedRoute>
  );
}

