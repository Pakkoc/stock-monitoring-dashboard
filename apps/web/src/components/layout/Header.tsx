'use client';

/**
 * Top bar header — search, connection status, widget manager, user menu.
 */
import { useState, useCallback } from 'react';
import {
  Search,
  Wifi,
  WifiOff,
  LayoutGrid,
  Settings,
  User,
  Edit3,
  RotateCcw,
  Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/stores/dashboard';
import { useRealtimeStore } from '@/stores/realtime';
import { WIDGET_CONFIGS, type WidgetType } from '@/lib/widget-configs';

export function Header() {
  const connectionStatus = useRealtimeStore((s) => s.connectionStatus);
  const isMarketOpen = useRealtimeStore((s) => s.isMarketOpen);
  const {
    isEditMode,
    setEditMode,
    visibleWidgets,
    toggleWidget,
    resetLayout,
  } = useDashboardStore();
  const [showWidgetManager, setShowWidgetManager] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (searchQuery.trim()) {
        // Search functionality — sets active symbol or navigates
        useDashboardStore.getState().setActiveSymbol(searchQuery.trim());
        setSearchQuery('');
      }
    },
    [searchQuery],
  );

  return (
    <header className="flex h-14 items-center justify-between border-b bg-card px-4">
      {/* Left section: Search */}
      <form onSubmit={handleSearch} className="flex items-center gap-2">
        <div className="relative">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="종목 검색 (코드 또는 이름)"
            className="h-9 w-64 rounded-md border bg-background pl-9 pr-3 text-sm outline-none ring-ring focus:ring-2"
          />
        </div>
      </form>

      {/* Center section: Market status */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 text-sm">
          {connectionStatus === 'connected' ? (
            <Wifi size={14} className="text-green-500" />
          ) : (
            <WifiOff size={14} className="text-destructive" />
          )}
          <span
            className={cn(
              'text-xs font-medium',
              connectionStatus === 'connected'
                ? 'text-green-500'
                : 'text-destructive',
            )}
          >
            {connectionStatus === 'connected' ? '연결됨' : '연결 끊김'}
          </span>
        </div>
        <div
          className={cn(
            'rounded-full px-2.5 py-0.5 text-xs font-semibold',
            isMarketOpen
              ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
              : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
          )}
        >
          {isMarketOpen ? '장 운영중' : '장 마감'}
        </div>
      </div>

      {/* Right section: Controls */}
      <div className="flex items-center gap-2">
        {/* Edit mode toggle */}
        <button
          onClick={() => setEditMode(!isEditMode)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
            isEditMode
              ? 'bg-primary text-primary-foreground'
              : 'text-muted-foreground hover:bg-accent',
          )}
          title={isEditMode ? '편집 완료' : '레이아웃 편집'}
        >
          <Edit3 size={14} />
          {isEditMode ? '완료' : '편집'}
        </button>

        {/* Widget manager */}
        <div className="relative">
          <button
            onClick={() => setShowWidgetManager(!showWidgetManager)}
            className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
            title="위젯 관리"
          >
            <LayoutGrid size={14} />
            위젯
          </button>

          {showWidgetManager && (
            <WidgetManagerPopover
              visibleWidgets={visibleWidgets}
              onToggle={toggleWidget}
              onReset={resetLayout}
              onClose={() => setShowWidgetManager(false)}
            />
          )}
        </div>

        {/* User menu placeholder */}
        <button
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent"
          title="사용자 설정"
        >
          <User size={14} />
        </button>
      </div>
    </header>
  );
}

// --- Widget Manager Popover ---

interface WidgetManagerPopoverProps {
  visibleWidgets: WidgetType[];
  onToggle: (widget: WidgetType) => void;
  onReset: () => void;
  onClose: () => void;
}

function WidgetManagerPopover({
  visibleWidgets,
  onToggle,
  onReset,
  onClose,
}: WidgetManagerPopoverProps) {
  const widgetEntries = Object.values(WIDGET_CONFIGS);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40" onClick={onClose} />

      {/* Popover */}
      <div className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border bg-card p-3 shadow-lg">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">위젯 관리</h3>
          <button
            onClick={onReset}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            title="기본 레이아웃으로 초기화"
          >
            <RotateCcw size={12} />
            초기화
          </button>
        </div>

        <div className="space-y-1">
          {widgetEntries.map((config) => {
            const isVisible = visibleWidgets.includes(config.type);
            return (
              <button
                key={config.type}
                onClick={() => onToggle(config.type)}
                className={cn(
                  'flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors',
                  isVisible
                    ? 'bg-primary/5 text-foreground'
                    : 'text-muted-foreground hover:bg-accent',
                )}
              >
                <div className="text-left">
                  <div className="font-medium">{config.title}</div>
                  <div className="text-xs text-muted-foreground">
                    {config.description}
                  </div>
                </div>
                {isVisible && (
                  <Check size={14} className="shrink-0 text-primary" />
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
