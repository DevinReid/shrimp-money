'use client';

import { createContext, useContext, useState, useEffect, useCallback, Suspense } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

const LoadingContext = createContext(null);

function LoadingProviderInner({ children }) {
  const [loading, setLoading] = useState(true); // Start with true for initial page load
  const [loadingCount, setLoadingCount] = useState(1); // Start with 1 for initial load
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Track loading state based on count
  useEffect(() => {
    setLoading(loadingCount > 0);
  }, [loadingCount]);

  // Handle initial page load
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // Mark initial load as complete after a short delay
      const timer = setTimeout(() => {
        setLoadingCount(prev => Math.max(0, prev - 1));
      }, 500);
      return () => clearTimeout(timer);
    }
  }, []);

  // Track route changes
  useEffect(() => {
    setLoadingCount(prev => prev + 1);
    const timer = setTimeout(() => {
      setLoadingCount(prev => Math.max(0, prev - 1));
    }, 300);
    return () => clearTimeout(timer);
  }, [pathname, searchParams]);

  const startLoading = useCallback(() => {
    setLoadingCount(prev => prev + 1);
  }, []);

  const stopLoading = useCallback(() => {
    setLoadingCount(prev => Math.max(0, prev - 1));
  }, []);

  // Intercept fetch calls
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const originalFetch = window.fetch;
    
    window.fetch = async function(...args) {
      startLoading();
      try {
        const response = await originalFetch(...args);
        // Wait for response to be fully processed
        if (response.clone) {
          response.clone().text().catch(() => {});
        }
        return response;
      } finally {
        // Small delay to prevent flickering on fast requests
        setTimeout(() => {
          stopLoading();
        }, 150);
      }
    };

    return () => {
      window.fetch = originalFetch;
    };
  }, [startLoading, stopLoading]);

  return (
    <LoadingContext.Provider value={{ loading, startLoading, stopLoading }}>
      {children}
    </LoadingContext.Provider>
  );
}

export function LoadingProvider({ children }) {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <LoadingProviderInner>{children}</LoadingProviderInner>
    </Suspense>
  );
}

export function useLoading() {
  const context = useContext(LoadingContext);
  if (!context) {
    throw new Error('useLoading must be used within LoadingProvider');
  }
  return context;
}

