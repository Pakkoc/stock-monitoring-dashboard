'use client';

/**
 * Dashboard page — main widget grid with React Grid Layout.
 *
 * Features:
 * - Drag-and-drop widget positioning
 * - Resizable widgets
 * - Layout persistence to localStorage via Zustand
 * - Responsive breakpoints (xl: 1920, lg: 1440, md: 1280)
 * - Widget add/remove via header controls
 */
import { useCallback, useMemo } from 'react';
import { Responsive, WidthProvider } from 'react-grid-layout';
import type { Layouts, Layout } from 'react-grid-layout';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';

import { GRID_CONFIG, BREAKPOINTS, COLS } from '@/lib/grid-config';
import { DEFAULT_LAYOUTS } from '@/lib/default-layouts';
import type { WidgetType } from '@/lib/widget-configs';
import { useDashboardStore } from '@/stores/dashboard';

import { WatchlistWidget } from '@/components/widgets/WatchlistWidget';
import { CandlestickChartWidget } from '@/components/widgets/CandlestickChartWidget';
import { NewsFeedWidget } from '@/components/widgets/NewsFeedWidget';
import { ThemeSummaryWidget } from '@/components/widgets/ThemeSummaryWidget';
import { SurgeAlertWidget } from '@/components/widgets/SurgeAlertWidget';
import { MarketIndicesWidget } from '@/components/widgets/MarketIndicesWidget';
import { TopVolumeWidget } from '@/components/widgets/TopVolumeWidget';

import { Sidebar } from '@/components/layout/Sidebar';
import { Header } from '@/components/layout/Header';

const ResponsiveGridLayout = WidthProvider(Responsive);

/** Map widget type to its component */
const WIDGET_COMPONENTS: Record<WidgetType, React.ComponentType> = {
  watchlist: WatchlistWidget,
  candlestick: CandlestickChartWidget,
  newsFeed: NewsFeedWidget,
  themeSummary: ThemeSummaryWidget,
  surgeAlerts: SurgeAlertWidget,
  marketIndices: MarketIndicesWidget,
  topVolume: TopVolumeWidget,
};

export default function DashboardPage() {
  const layouts = useDashboardStore((s) => s.layouts);
  const setLayouts = useDashboardStore((s) => s.setLayouts);
  const visibleWidgets = useDashboardStore((s) => s.visibleWidgets);
  const isEditMode = useDashboardStore((s) => s.isEditMode);

  // Handle layout changes from drag/resize
  const handleLayoutChange = useCallback(
    (_currentLayout: Layout[], allLayouts: Layouts) => {
      setLayouts(allLayouts);
    },
    [setLayouts],
  );

  // Filter layouts to only include visible widgets
  const filteredLayouts = useMemo(() => {
    const result: Layouts = {};
    for (const [breakpoint, layoutItems] of Object.entries(
      layouts && Object.keys(layouts).length > 0 ? layouts : DEFAULT_LAYOUTS,
    )) {
      result[breakpoint] = (layoutItems as Layout[]).filter((item) =>
        visibleWidgets.includes(item.i as WidgetType),
      );
    }
    return result;
  }, [layouts, visibleWidgets]);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />

      <div className="flex flex-1 flex-col overflow-hidden">
        <Header />

        <main className="flex-1 overflow-auto bg-background p-4">
          <ResponsiveGridLayout
            className="layout"
            layouts={filteredLayouts}
            breakpoints={BREAKPOINTS}
            cols={COLS}
            rowHeight={GRID_CONFIG.rowHeight}
            margin={GRID_CONFIG.margin}
            containerPadding={GRID_CONFIG.containerPadding}
            compactType={GRID_CONFIG.compactType}
            preventCollision={GRID_CONFIG.preventCollision}
            isResizable={GRID_CONFIG.isResizable}
            isDraggable={isEditMode && GRID_CONFIG.isDraggable}
            draggableHandle={GRID_CONFIG.draggableHandle}
            resizeHandles={[...GRID_CONFIG.resizeHandles]}
            onLayoutChange={handleLayoutChange}
            useCSSTransforms
          >
            {visibleWidgets.map((widgetType) => {
              const WidgetComponent = WIDGET_COMPONENTS[widgetType];
              if (!WidgetComponent) return null;

              return (
                <div key={widgetType} className="h-full">
                  <WidgetComponent />
                </div>
              );
            })}
          </ResponsiveGridLayout>
        </main>
      </div>
    </div>
  );
}
