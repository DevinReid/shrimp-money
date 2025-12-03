'use client';

import { AuthProvider } from '@/components/auth/AuthContext';
import { CategoriesProvider } from '@/components/CategoriesContext';
import { RulesProvider } from '@/components/RulesContext';
import { LoadingProvider } from '@/components/LoadingContext';

export function Providers({ children }) {
  return (
    <LoadingProvider>
      <AuthProvider>
        <CategoriesProvider>
          <RulesProvider>
            {children}
          </RulesProvider>
        </CategoriesProvider>
      </AuthProvider>
    </LoadingProvider>
  );
}

