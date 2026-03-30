/**
 * TanStack Query key hierarchy.
 *
 * Strict hierarchy enables both granular and broad cache invalidation.
 * Pattern: domain → scope → parameters
 */

export interface StockFilters {
  market?: 'kospi' | 'kosdaq';
  sector?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  page?: number;
  limit?: number;
}

export const queryKeys = {
  stocks: {
    all: ['stocks'] as const,
    list: (filters: StockFilters) => ['stocks', 'list', filters] as const,
    detail: (symbol: string) => ['stocks', 'detail', symbol] as const,
    prices: (symbol: string, timeframe: string) =>
      ['stocks', 'prices', symbol, timeframe] as const,
    news: (symbol: string) => ['stocks', 'news', symbol] as const,
  },

  themes: {
    all: ['themes'] as const,
    list: () => ['themes', 'list'] as const,
    performance: () => ['themes', 'performance'] as const,
    detail: (themeId: string) => ['themes', 'detail', themeId] as const,
  },

  watchlists: {
    all: ['watchlists'] as const,
    list: () => ['watchlists', 'list'] as const,
    detail: (id: string) => ['watchlists', 'detail', id] as const,
  },

  aiAnalysis: {
    all: ['ai-analysis'] as const,
    byStock: (symbol: string) => ['ai-analysis', symbol] as const,
  },

  marketIndices: {
    all: ['market-indices'] as const,
    kospi: () => ['market-indices', 'kospi'] as const,
    kosdaq: () => ['market-indices', 'kosdaq'] as const,
  },

  alerts: {
    all: ['alerts'] as const,
    active: () => ['alerts', 'active'] as const,
    surge: () => ['alerts', 'surge'] as const,
    surgeCauses: () => ['alerts', 'surge-causes'] as const,
  },

  admin: {
    all: ['admin'] as const,
    health: () => ['admin', 'health'] as const,
    users: () => ['admin', 'users'] as const,
    settings: () => ['admin', 'settings'] as const,
    collection: () => ['admin', 'collection'] as const,
  },
} as const;
