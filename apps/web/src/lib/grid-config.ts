/**
 * React Grid Layout configuration constants.
 *
 * Grid system: 12-column layout with 40px row height.
 * Matches the design spec from step-9-frontend-design.md §3.
 */

export const GRID_CONFIG = {
  rowHeight: 40,
  margin: [12, 12] as [number, number],
  containerPadding: [16, 16] as [number, number],
  compactType: 'vertical' as const,
  preventCollision: false,
  isResizable: true,
  isDraggable: true,
  draggableHandle: '.widget-drag-handle',
  resizeHandles: ['se', 'sw'] as ('se' | 'sw')[],
} as const;

export const BREAKPOINTS = {
  xl: 1920,
  lg: 1440,
  md: 1280,
} as const;

export const COLS = {
  xl: 12,
  lg: 12,
  md: 10,
} as const;
