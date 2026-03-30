'use client';

/**
 * Common widget wrapper — provides drag handle, title bar, minimize/maximize, remove.
 *
 * All dashboard widgets are wrapped in this component which provides
 * a consistent UI frame using shadcn/ui Card as the container.
 */
import { useState, useCallback, type ReactNode } from 'react';
import { GripVertical, Minimize2, Maximize2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useDashboardStore } from '@/stores/dashboard';
import type { WidgetType } from '@/lib/widget-configs';

interface WidgetWrapperProps {
  widgetId: string;
  title: string;
  children: ReactNode;
  /** Additional header actions to render between title and control buttons */
  headerActions?: ReactNode;
  className?: string;
}

export function WidgetWrapper({
  widgetId,
  title,
  children,
  headerActions,
  className,
}: WidgetWrapperProps) {
  const [minimized, setMinimized] = useState(false);
  const isEditMode = useDashboardStore((s) => s.isEditMode);
  const removeWidget = useDashboardStore((s) => s.removeWidget);

  const handleRemove = useCallback(() => {
    removeWidget(widgetId as WidgetType);
  }, [removeWidget, widgetId]);

  const handleToggleMinimize = useCallback(() => {
    setMinimized((prev) => !prev);
  }, []);

  return (
    <div
      className={cn(
        'flex h-full flex-col rounded-lg border bg-card shadow-sm',
        isEditMode && 'ring-2 ring-primary/20',
        className,
      )}
    >
      {/* Title bar */}
      <div className="flex items-center justify-between border-b px-3 py-2">
        <div className="flex items-center gap-2">
          {/* Drag handle — only active in edit mode */}
          <div
            className={cn(
              'widget-drag-handle flex cursor-grab items-center text-muted-foreground active:cursor-grabbing',
              !isEditMode && 'cursor-default opacity-0',
            )}
          >
            <GripVertical size={14} />
          </div>
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>

        <div className="flex items-center gap-1">
          {headerActions}

          <button
            onClick={handleToggleMinimize}
            className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            title={minimized ? '확대' : '축소'}
          >
            {minimized ? <Maximize2 size={12} /> : <Minimize2 size={12} />}
          </button>

          {isEditMode && (
            <button
              onClick={handleRemove}
              className="rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
              title="위젯 제거"
            >
              <X size={12} />
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      {!minimized && (
        <div className="flex-1 overflow-auto p-3">{children}</div>
      )}
    </div>
  );
}
