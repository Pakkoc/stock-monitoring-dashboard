/**
 * Widget type definitions and metadata.
 *
 * Each widget type has a unique key, display name, and default grid dimensions.
 */

export type WidgetType =
  | 'watchlist'
  | 'candlestick'
  | 'newsFeed'
  | 'themeSummary'
  | 'surgeAlerts'
  | 'aiAnalysis'
  | 'marketIndices'
  | 'topVolume';

export interface WidgetConfig {
  type: WidgetType;
  title: string;
  description: string;
  defaultW: number;
  defaultH: number;
  minW: number;
  minH: number;
  maxW?: number;
}

export const WIDGET_CONFIGS: Record<WidgetType, WidgetConfig> = {
  watchlist: {
    type: 'watchlist',
    title: '관심종목',
    description: '실시간 관심종목 리스트',
    defaultW: 4,
    defaultH: 8,
    minW: 3,
    minH: 4,
  },
  candlestick: {
    type: 'candlestick',
    title: '캔들스틱 차트',
    description: '실시간 캔들스틱 차트',
    defaultW: 6,
    defaultH: 8,
    minW: 4,
    minH: 5,
    maxW: 12,
  },
  newsFeed: {
    type: 'newsFeed',
    title: '뉴스 피드',
    description: '관련 뉴스 목록',
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 4,
  },
  themeSummary: {
    type: 'themeSummary',
    title: '테마 요약',
    description: '테마별 등락률 요약',
    defaultW: 3,
    defaultH: 5,
    minW: 2,
    minH: 3,
  },
  surgeAlerts: {
    type: 'surgeAlerts',
    title: '급등 알림',
    description: '실시간 급등 종목 알림',
    defaultW: 3,
    defaultH: 4,
    minW: 2,
    minH: 3,
  },
  aiAnalysis: {
    type: 'aiAnalysis',
    title: 'AI 분석',
    description: 'AI 기반 급등 원인 분석',
    defaultW: 4,
    defaultH: 6,
    minW: 3,
    minH: 4,
  },
  marketIndices: {
    type: 'marketIndices',
    title: '시장 지수',
    description: 'KOSPI/KOSDAQ 실시간 지수',
    defaultW: 3,
    defaultH: 3,
    minW: 2,
    minH: 2,
  },
  topVolume: {
    type: 'topVolume',
    title: '거래량 상위',
    description: '거래량 상위 종목',
    defaultW: 4,
    defaultH: 5,
    minW: 3,
    minH: 3,
  },
} as const;

export const ALL_WIDGET_TYPES: WidgetType[] = Object.keys(WIDGET_CONFIGS) as WidgetType[];
