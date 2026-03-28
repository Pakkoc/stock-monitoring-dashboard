/**
 * Dashboard layout store — manages widget grid state.
 *
 * Uses Zustand with localStorage persistence for layout preferences.
 * Stores: grid layouts per breakpoint, visible widget set, edit mode, active stock.
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Layouts } from 'react-grid-layout';
import { DEFAULT_LAYOUTS } from '@/lib/default-layouts';
import type { WidgetType } from '@/lib/widget-configs';
import { ALL_WIDGET_TYPES } from '@/lib/widget-configs';

export interface WidgetLayout {
  i: string;
  x: number;
  y: number;
  w: number;
  h: number;
  minW?: number;
  minH?: number;
}

interface DashboardState {
  /** Current grid layout for each breakpoint */
  layouts: Layouts;
  /** Currently visible widgets */
  visibleWidgets: WidgetType[];
  /** Whether widget edit mode (drag/resize handles visible) is active */
  isEditMode: boolean;
  /** Currently active (selected) stock symbol */
  activeSymbol: string | null;
  /** Navigation history of previously selected symbols (max 10) */
  previousSymbols: string[];

  // Layout actions
  setLayouts: (layouts: Layouts) => void;
  toggleWidget: (widget: WidgetType) => void;
  removeWidget: (widget: WidgetType) => void;
  addWidget: (widget: WidgetType) => void;
  resetLayout: () => void;
  setEditMode: (editing: boolean) => void;

  // Active stock actions
  setActiveSymbol: (symbol: string) => void;
  clearActiveSymbol: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      layouts: DEFAULT_LAYOUTS,
      visibleWidgets: [...ALL_WIDGET_TYPES],
      isEditMode: false,
      activeSymbol: null,
      previousSymbols: [],

      setLayouts: (layouts) => set({ layouts }),

      toggleWidget: (widget) =>
        set((state) => ({
          visibleWidgets: state.visibleWidgets.includes(widget)
            ? state.visibleWidgets.filter((w) => w !== widget)
            : [...state.visibleWidgets, widget],
        })),

      removeWidget: (widget) =>
        set((state) => ({
          visibleWidgets: state.visibleWidgets.filter((w) => w !== widget),
        })),

      addWidget: (widget) =>
        set((state) => {
          if (state.visibleWidgets.includes(widget)) return state;
          return { visibleWidgets: [...state.visibleWidgets, widget] };
        }),

      resetLayout: () =>
        set({
          layouts: DEFAULT_LAYOUTS,
          visibleWidgets: [...ALL_WIDGET_TYPES],
        }),

      setEditMode: (editing) => set({ isEditMode: editing }),

      setActiveSymbol: (symbol) =>
        set((state) => ({
          activeSymbol: symbol,
          previousSymbols: state.activeSymbol
            ? [state.activeSymbol, ...state.previousSymbols.slice(0, 9)]
            : state.previousSymbols,
        })),

      clearActiveSymbol: () => set({ activeSymbol: null }),
    }),
    {
      name: 'smd-dashboard',
      partialize: (state) => ({
        layouts: state.layouts,
        visibleWidgets: state.visibleWidgets,
        activeSymbol: state.activeSymbol,
      }),
    },
  ),
);
