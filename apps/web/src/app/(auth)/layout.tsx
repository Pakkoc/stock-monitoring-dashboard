/**
 * Auth layout — centered card layout for login/signup pages.
 * No sidebar, no header. Clean minimal design.
 */
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-background to-muted/50 p-4">
      {children}
    </div>
  );
}
