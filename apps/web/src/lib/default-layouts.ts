/**
 * Default widget grid layouts per breakpoint.
 *
 * Layout follows the visual arrangement:
 * - Row 1: Watchlist (left) + Chart (center) + Market Indices & Surge (right)
 * - Row 2: News (left) + Theme Summary (center) + Top Volume (right)
 */
import type { Layouts } from 'react-grid-layout';

export const DEFAULT_LAYOUTS: Layouts = {
  xl: [
    // Row 1
    { i: 'watchlist', x: 0, y: 0, w: 4, h: 8, minW: 3, minH: 4 },
    { i: 'candlestick', x: 4, y: 0, w: 6, h: 8, minW: 4, minH: 5 },
    { i: 'marketIndices', x: 10, y: 0, w: 2, h: 3, minW: 2, minH: 2 },
    { i: 'surgeAlerts', x: 10, y: 3, w: 2, h: 5, minW: 2, minH: 3 },
    // Row 2
    { i: 'newsFeed', x: 0, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'themeSummary', x: 4, y: 8, w: 4, h: 6, minW: 2, minH: 3 },
    { i: 'topVolume', x: 8, y: 8, w: 4, h: 6, minW: 3, minH: 3 },
  ],

  lg: [
    { i: 'watchlist', x: 0, y: 0, w: 4, h: 8, minW: 3, minH: 4 },
    { i: 'candlestick', x: 4, y: 0, w: 5, h: 8, minW: 4, minH: 5 },
    { i: 'marketIndices', x: 9, y: 0, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'surgeAlerts', x: 9, y: 3, w: 3, h: 5, minW: 2, minH: 3 },
    { i: 'newsFeed', x: 0, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'themeSummary', x: 4, y: 8, w: 4, h: 6, minW: 2, minH: 3 },
    { i: 'topVolume', x: 8, y: 8, w: 4, h: 6, minW: 3, minH: 3 },
  ],

  md: [
    { i: 'watchlist', x: 0, y: 0, w: 4, h: 8, minW: 3, minH: 4 },
    { i: 'candlestick', x: 4, y: 0, w: 6, h: 8, minW: 4, minH: 5 },
    { i: 'marketIndices', x: 0, y: 8, w: 3, h: 3, minW: 2, minH: 2 },
    { i: 'surgeAlerts', x: 3, y: 8, w: 3, h: 4, minW: 2, minH: 3 },
    { i: 'newsFeed', x: 6, y: 8, w: 4, h: 6, minW: 3, minH: 4 },
    { i: 'themeSummary', x: 0, y: 12, w: 5, h: 5, minW: 2, minH: 3 },
    { i: 'topVolume', x: 5, y: 12, w: 5, h: 5, minW: 3, minH: 3 },
  ],
};
