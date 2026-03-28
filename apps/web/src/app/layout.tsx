import type { Metadata } from 'next';
import './globals.css';
import { Providers } from './providers';

export const metadata: Metadata = {
  title: 'Stock Monitoring Dashboard',
  description: 'Real-time Korean stock monitoring with AI-powered surge analysis',
  keywords: ['stock', 'monitoring', 'dashboard', 'KOSPI', 'KOSDAQ', 'AI', 'surge'],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
