'use client';

/**
 * Root client providers — wraps the app with QueryClient, Socket, and any
 * other global providers needed.
 */
import type { ReactNode } from 'react';
import { QueryProvider } from '@/components/providers/QueryProvider';
import { SocketProvider } from '@/components/providers/SocketProvider';

interface ProvidersProps {
  children: ReactNode;
}

export function Providers({ children }: ProvidersProps) {
  return (
    <QueryProvider>
      <SocketProvider>{children}</SocketProvider>
    </QueryProvider>
  );
}
