'use client';

/**
 * TanStack Query provider with stable QueryClient instance.
 *
 * Uses a ref to ensure the QueryClient is created once per component lifecycle,
 * avoiding unnecessary re-creation on re-renders.
 */
import { QueryClientProvider } from '@tanstack/react-query';
import { useRef, type ReactNode } from 'react';
import { createQueryClient } from '@/lib/query-client';
import type { QueryClient } from '@tanstack/react-query';

interface QueryProviderProps {
  children: ReactNode;
}

export function QueryProvider({ children }: QueryProviderProps) {
  const queryClientRef = useRef<QueryClient | null>(null);

  if (!queryClientRef.current) {
    queryClientRef.current = createQueryClient();
  }

  return (
    <QueryClientProvider client={queryClientRef.current}>
      {children}
    </QueryClientProvider>
  );
}
