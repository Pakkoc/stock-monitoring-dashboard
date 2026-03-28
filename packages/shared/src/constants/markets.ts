/**
 * Korean stock market constants
 */

/** Market codes */
export const MARKETS = {
  KOSPI: 'KOSPI',
  KOSDAQ: 'KOSDAQ',
} as const;

/** Korean stock color convention (opposite of US) */
export const STOCK_COLORS = {
  /** Price increase — Red in Korean markets */
  UP_RED: '#EF4444',
  /** Price decrease — Blue in Korean markets */
  DOWN_BLUE: '#3B82F6',
  /** No change — Gray */
  FLAT_GRAY: '#6B7280',
} as const;

/** Market trading hours (KST = UTC+9) */
export const MARKET_HOURS = {
  /** Pre-market starts at 08:00 KST */
  PRE_MARKET_START: '08:00',
  /** Regular session starts at 09:00 KST */
  REGULAR_START: '09:00',
  /** Regular session ends at 15:30 KST */
  REGULAR_END: '15:30',
  /** After-hours ends at 18:00 KST */
  AFTER_HOURS_END: '18:00',
} as const;

/** Default surge threshold percentage */
export const DEFAULT_SURGE_THRESHOLD = 5.0;

/** Maximum WebSocket subscriptions per KIS session */
export const KIS_MAX_SUBSCRIPTIONS = 41;
