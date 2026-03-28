/**
 * Admin layout — wraps the admin route group.
 * Admin role validation can be added here as server component check.
 */
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
