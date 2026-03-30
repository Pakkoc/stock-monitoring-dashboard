/**
 * Stock domain types — shared between frontend and backend
 */

/** Korean stock market identifiers */
export type Market = 'KOSPI' | 'KOSDAQ';

/** Stock entity — represents a listed company */
export interface Stock {
  id: string;
  symbol: string;
  name: string;
  nameEn: string | null;
  market: Market;
  sector: string | null;
  isActive: boolean;
  listedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

/** Real-time price tick from KIS WebSocket */
export interface RealTimePrice {
  symbol: string;
  currentPrice: number;
  changePrice: number;
  changeRate: number;
  volume: number;
  tradingValue: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
  timestamp: Date;
}

/** OHLCV candlestick data */
export interface OHLCV {
  symbol: string;
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Stock price record stored in TimescaleDB */
export interface StockPrice {
  symbol: string;
  timestamp: Date;
  currentPrice: number;
  changePrice: number;
  changeRate: number;
  volume: number;
  tradingValue: number;
  high: number;
  low: number;
  open: number;
  previousClose: number;
}

/** Stock search/filter result */
export interface StockInfo {
  id: number;
  symbol: string;
  name: string;
  market: Market;
  sector: string | null;
  currentPrice: number;
  changeRate: number;
  volume: number;
}

/** Market index (KOSPI / KOSDAQ) */
export interface MarketIndex {
  market: Market;
  currentValue: number;
  changeValue: number;
  changeRate: number;
  volume: number;
  tradingValue: number;
  timestamp: Date;
}
