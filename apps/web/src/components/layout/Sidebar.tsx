'use client';

/**
 * Navigation sidebar — collapsible left panel.
 *
 * Contains navigation links for dashboard, watchlist, themes, settings.
 * Collapse state persisted in localStorage.
 */
import { useState, useCallback } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Star,
  TrendingUp,
  Newspaper,
  Brain,
  Settings,
  ChevronLeft,
  ChevronRight,
  BarChart3,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: '대시보드', icon: LayoutDashboard },
  { href: '/dashboard', label: '관심종목', icon: Star },
  { href: '/dashboard', label: '테마', icon: TrendingUp },
  { href: '/dashboard', label: '뉴스', icon: Newspaper },
  { href: '/dashboard', label: 'AI 분석', icon: Brain },
  { href: '/dashboard', label: '시장 지수', icon: BarChart3 },
];

const BOTTOM_ITEMS: NavItem[] = [
  { href: '/dashboard', label: '설정', icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  const toggleCollapse = useCallback(() => {
    setCollapsed((prev) => !prev);
  }, []);

  return (
    <aside
      className={cn(
        'flex h-screen flex-col border-r bg-card transition-all duration-200',
        collapsed ? 'w-16' : 'w-56',
      )}
    >
      {/* Logo / Brand */}
      <div className="flex h-14 items-center border-b px-4">
        <BarChart3 size={24} className="shrink-0 text-primary" />
        {!collapsed && (
          <span className="ml-2 text-sm font-bold text-foreground">
            Stock Monitor
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        {NAV_ITEMS.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
                collapsed && 'justify-center px-2',
              )}
              title={collapsed ? item.label : undefined}
            >
              <item.icon size={18} className="shrink-0" />
              {!collapsed && <span className="ml-3">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* Bottom section */}
      <div className="space-y-1 border-t px-2 py-4">
        {BOTTOM_ITEMS.map((item) => (
          <Link
            key={item.label}
            href={item.href}
            className={cn(
              'flex items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
              collapsed && 'justify-center px-2',
            )}
            title={collapsed ? item.label : undefined}
          >
            <item.icon size={18} className="shrink-0" />
            {!collapsed && <span className="ml-3">{item.label}</span>}
          </Link>
        ))}

        {/* Collapse toggle */}
        <button
          onClick={toggleCollapse}
          className={cn(
            'flex w-full items-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground',
            collapsed && 'justify-center px-2',
          )}
          aria-label={collapsed ? '사이드바 확장' : '사이드바 축소'}
        >
          {collapsed ? (
            <ChevronRight size={18} />
          ) : (
            <>
              <ChevronLeft size={18} className="shrink-0" />
              <span className="ml-3">접기</span>
            </>
          )}
        </button>
      </div>
    </aside>
  );
}
