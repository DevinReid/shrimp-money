'use client';

import { Suspense } from 'react';
import ProtectedRoute from '@/components/auth/ProtectedRoute';
import PlaidApp from '@/components/PlaidApp';
import './page.css';

function PlaidAppWrapper() {
  return (
    <ProtectedRoute>
      <PlaidApp />
    </ProtectedRoute>
  );
}

export default function Home() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <PlaidAppWrapper />
    </Suspense>
  );
}

