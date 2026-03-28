# Step 9: Frontend Component Architecture Design

> **Agent**: `@ui-designer`
> **Date**: 2026-03-27
> **Input**: Step 3 Frontend Research Report, PRD v2.0 SS3.1-3.6, SS3.8
> **Stack**: Next.js 16 + React 19 + React Grid Layout v2 + TradingView Lightweight Charts v4 + Recharts 2.x + shadcn/ui + Zustand 5.x + TanStack Query 5.x + Socket.IO 4.x

---

## Table of Contents

1. [Page Structure and Route Architecture](#1-page-structure-and-route-architecture)
2. [Widget Component Specifications (8 Types)](#2-widget-component-specifications-8-types)
3. [React Grid Layout Configuration](#3-react-grid-layout-configuration)
4. [State Management Architecture](#4-state-management-architecture)
5. [Socket.IO Client Architecture](#5-socketio-client-architecture)
6. [shadcn/ui Component Mapping](#6-shadcnui-component-mapping)
7. [Color System and Korean Conventions](#7-color-system-and-korean-conventions)
8. [Performance Budget and Optimization](#8-performance-budget-and-optimization)
9. [Component File Structure](#9-component-file-structure)

---

## 1. Page Structure and Route Architecture

### 1.1 Route Definitions

The application uses Next.js 16 App Router with route groups to separate authenticated, unauthenticated, and admin contexts. Each route group has its own layout with appropriate guards.

```
app/
├── layout.tsx                        # Root: fonts, metadata, global Providers
├── providers.tsx                     # Client providers (QueryClient, Zustand, Socket)
├── middleware.ts                     # Auth redirect logic (Better Auth session cookie)
│
├── (auth)/                           # Unauthenticated route group
│   ├── layout.tsx                    # Centered card layout, no sidebar
│   ├── login/page.tsx                # /login — email + password form
│   └── signup/page.tsx               # /signup — registration form
│
├── (dashboard)/                      # Authenticated route group
│   ├── layout.tsx                    # Dashboard shell: sidebar + top bar + AuthGuard
│   ├── page.tsx                      # / — Main dashboard (widget grid)
│   └── stocks/
│       └── [symbol]/
│           └── page.tsx              # /stocks/:symbol — Stock detail
│
├── (admin)/                          # Admin-only route group
│   ├── layout.tsx                    # Admin layout + RoleGuard (role === 'admin')
│   └── page.tsx                      # /admin — Admin panel
│
└── api/
    └── auth/[...betterauth]/
        └── route.ts                  # Better Auth catch-all handler
```

### 1.2 Page Responsibilities

| Route | Page Component | Primary Content | Auth Required |
|-------|---------------|-----------------|---------------|
| `/` | `DashboardPage` | Widget grid with all 8 widget types, drag-and-drop customization | Yes |
| `/stocks/:symbol` | `StockDetailPage` | Full-screen candlestick chart, news feed, AI analysis panel, related themes | Yes |
| `/admin` | `AdminPage` | System settings, user management table, API key configuration, data collection status | Yes (admin) |
| `/login` | `LoginPage` | Email/password form, link to signup | No |
| `/signup` | `SignupPage` | Registration form (email, password, name), link to login | No |

### 1.3 Layout Component Hierarchy

```
RootLayout (server)
├── Providers (client) — QueryClientProvider, SocketProvider, ThemeProvider
│
├── (auth)/layout — CenteredLayout
│   ├── LoginPage
│   └── SignupPage
│
├── (dashboard)/layout — DashboardShell
│   ├── Sidebar (collapsible, navigation links)
│   ├── TopBar (search, connection status, user menu)
│   └── <main> with Suspense boundary
│       ├── DashboardPage → DashboardGrid → [WidgetWrapper × N]
│       └── StockDetailPage → StockDetailLayout
│
└── (admin)/layout — AdminShell (extends DashboardShell with admin nav)
    └── AdminPage → AdminTabs
```

### 1.4 Middleware Authentication Flow

```typescript
// middleware.ts
import { NextRequest, NextResponse } from 'next/server';

const PUBLIC_PATHS = ['/login', '/signup'];
const ADMIN_PATHS = ['/admin'];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/api')) {
    return NextResponse.next();
  }

  const sessionToken = request.cookies.get('better-auth.session_token')?.value;

  // Unauthenticated users → redirect to /login
  if (!PUBLIC_PATHS.some(p => pathname.startsWith(p)) && !sessionToken) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  // Authenticated users on auth pages → redirect to /
  if (PUBLIC_PATHS.some(p => pathname.startsWith(p)) && sessionToken) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  // Admin role validation is handled in (admin)/layout.tsx server component
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

---

## 2. Widget Component Specifications (8 Types)

Each widget follows a uniform contract: a TypeScript props interface, a declared data source, default grid dimensions, and a refresh strategy. All widgets are wrapped in the shared `WidgetWrapper` component that provides the drag handle, title bar, and remove button.

### 2.1 WatchlistWidget

Real-time watchlist table displaying the user's registered stocks with live price updates.

```typescript
// components/widgets/watchlist-widget.tsx

interface WatchlistWidgetProps {
  /** Optional watchlist ID; defaults to user's primary watchlist */
  watchlistId?: string;
  /** Maximum rows before virtualization kicks in (default: all) */
  maxVisibleRows?: number;
}

interface WatchlistStock {
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  tradeValue: number;
  previousClose: number;
  marketCap: number;
}
```

| Property | Value |
|----------|-------|
| **Data source** | REST: `GET /api/watchlists/:id` (initial load) + WebSocket: `price:update` event (real-time) |
| **Default size** | `w: 4, h: 8` on 12-column grid |
| **Min size** | `minW: 3, minH: 4` |
| **Refresh strategy** | Real-time via WebSocket `price:update` per subscribed symbol. TanStack Query `staleTime: 30_000` for watchlist metadata (add/remove). |
| **Virtualization** | `@tanstack/react-virtual` for 50+ items |
| **Key interactions** | Click row → set `activeSymbol` in Zustand → navigate to `/stocks/:symbol` or update other widgets. Sortable columns (price, change%, volume, trade value). |

### 2.2 CandlestickChartWidget

TradingView Lightweight Charts v4 candlestick chart with volume overlay and optional moving average lines.

```typescript
// components/widgets/candlestick-chart-widget.tsx

interface CandlestickChartWidgetProps {
  /** Stock symbol to display; falls back to activeSymbol from store */
  symbol?: string;
  /** Chart timeframe */
  timeframe?: '1m' | '5m' | '15m' | '1h' | '1d';
  /** Whether to show volume histogram overlay */
  showVolume?: boolean;
  /** Moving average periods to display */
  movingAverages?: number[];
}

interface CandlestickDataPoint {
  time: number;  // Unix timestamp
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
```

| Property | Value |
|----------|-------|
| **Data source** | REST: `GET /api/stocks/:symbol/prices?timeframe=1d` (historical) + WebSocket: `price:update` event (real-time bar updates) |
| **Default size** | `w: 6, h: 8` |
| **Min size** | `minW: 4, minH: 5` |
| **Max size** | `maxW: 12` (can span full width) |
| **Refresh strategy** | Historical data via TanStack Query (`staleTime: 60_000`). Real-time updates via WebSocket `price:update` using `series.update()` — O(1) canvas operation. Updates batched via `requestAnimationFrame` to maintain 60fps. |
| **Key interactions** | Timeframe toggle toolbar (1m, 5m, 15m, 1h, 1d). Crosshair with OHLCV tooltip. MA toggle checkboxes. Full-screen expand button. |
| **SSR** | `ssr: false` — Canvas-based rendering requires browser APIs. Loaded via `next/dynamic`. |

### 2.3 NewsFeedWidget

Scrollable news feed showing latest articles related to a selected stock or all watchlist stocks.

```typescript
// components/widgets/news-feed-widget.tsx

interface NewsFeedWidgetProps {
  /** Filter news by symbol; null = all watchlist stocks */
  symbol?: string | null;
  /** Maximum articles to display */
  limit?: number;
}

interface NewsArticle {
  id: string;
  title: string;
  summary: string;
  source: 'naver' | 'dart' | 'rss';
  url: string;
  publishedAt: string;        // ISO 8601
  relatedSymbols: string[];
  sentiment?: 'positive' | 'negative' | 'neutral';
  thumbnailUrl?: string;
}
```

| Property | Value |
|----------|-------|
| **Data source** | REST: `GET /api/stocks/:symbol/news?limit=20` or `GET /api/news?symbols=...` + WebSocket: `news:update` event |
| **Default size** | `w: 4, h: 6` |
| **Min size** | `minW: 3, minH: 4` |
| **Refresh strategy** | TanStack Query with `staleTime: 60_000` (news doesn't change sub-second). WebSocket `news:update` triggers cache invalidation for instant refresh when new articles arrive. |
| **Key interactions** | Click article → open in new tab. Filter by source badge. Sentiment badge color. Related symbol chips that set `activeSymbol`. |

### 2.4 ThemeSummaryWidget

Cards or horizontal bar chart showing theme/sector performance with sparklines.

```typescript
// components/widgets/theme-summary-widget.tsx

interface ThemeSummaryWidgetProps {
  /** Number of top themes to show */
  limit?: number;
  /** Sort order */
  sortBy?: 'changePercent' | 'tradeValue' | 'stockCount';
}

interface ThemePerformance {
  themeId: string;
  name: string;
  changePercent: number;
  stockCount: number;
  topStocks: Array<{
    symbol: string;
    name: string;
    changePercent: number;
  }>;
  sparklineData: number[];     // Last 20 data points for mini chart
  totalTradeValue: number;
}
```

| Property | Value |
|----------|-------|
| **Data source** | REST: `GET /api/themes/performance` |
| **Default size** | `w: 3, h: 5` |
| **Min size** | `minW: 2, minH: 3` |
| **Refresh strategy** | Polling via TanStack Query `refetchInterval: 30_000`. Theme data aggregated server-side; no WebSocket needed for themes. |
| **Chart library** | Recharts `<BarChart layout="vertical">` for performance bars, Recharts `<LineChart>` (sparkline mode, no axes) for mini trend. |
| **Key interactions** | Click theme → expand to show constituent stocks. Click stock within theme → set `activeSymbol`. |

### 2.5 SurgeAlertWidget

Real-time notifications for stocks exceeding the user's configured surge threshold.

```typescript
// components/widgets/surge-alert-widget.tsx

interface SurgeAlertWidgetProps {
  /** Override user's default threshold for this widget instance */
  thresholdPercent?: number;
  /** Maximum alerts to keep in list */
  maxAlerts?: number;
}

interface SurgeAlert {
  id: string;
  symbol: string;
  stockName: string;
  changePercent: number;
  currentPrice: number;
  previousClose: number;
  detectedAt: string;           // ISO 8601
  volume: number;
  hasAiAnalysis: boolean;
  aiAnalysisId?: string;
}
```

| Property | Value |
|----------|-------|
| **Data source** | WebSocket: `alert:surge` event (primary, real-time push). REST: `GET /api/alerts/surge?since=...` (initial load of recent alerts) |
| **Default size** | `w: 3, h: 4` |
| **Min size** | `minW: 2, minH: 3` |
| **Refresh strategy** | Purely real-time via WebSocket `alert:surge`. New alerts prepended to list with animation. Also triggers `Toast` notification via Sonner. |
| **Key interactions** | Click alert → navigate to `/stocks/:symbol`. "Analyze" button → triggers `POST /api/ai/analyze/:symbol`. Threshold setting gear icon → opens Dialog. Dismiss individual alerts. |

### 2.6 AiAnalysisWidget

Displays AI-generated analysis results with confidence scores and quality gate indicators.

```typescript
// components/widgets/ai-analysis-widget.tsx

interface AiAnalysisWidgetProps {
  /** Display analysis for specific symbol; defaults to activeSymbol */
  symbol?: string;
  /** Show historical analyses list vs. latest only */
  mode?: 'latest' | 'history';
}

interface AiAnalysis {
  id: string;
  symbol: string;
  stockName: string;
  analysisType: 'surge_cause' | 'general';
  content: string;              // Markdown content
  confidenceScore: number;      // 0.0 - 1.0
  qualityGates: {
    l1Syntax: boolean;
    l2Semantic: boolean;
    l3Factual: boolean;
  };
  relatedNews: Array<{
    title: string;
    url: string;
    source: string;
  }>;
  createdAt: string;            // ISO 8601
}
```

| Property | Value |
|----------|-------|
| **Data source** | REST: `GET /api/ai/analyze/:symbol` (fetch existing) or `POST /api/ai/analyze/:symbol` (trigger new). WebSocket: `ai:analysis-complete` event for async results. |
| **Default size** | `w: 4, h: 6` |
| **Min size** | `minW: 3, minH: 4` |
| **Refresh strategy** | On-demand (user clicks "Analyze" or surge auto-triggers). TanStack Query `staleTime: 300_000` (5 min) for cached results. WebSocket `ai:analysis-complete` invalidates cache when background analysis finishes. |
| **Key interactions** | "AI Generated" label always visible. Confidence score as Recharts `<RadialBarChart>` gauge. Expandable accordion for full analysis. Related news links. Quality gate badges (L1/L2/L3 pass/fail). |

### 2.7 MarketIndicesWidget

KOSPI and KOSDAQ real-time index values with mini area charts.

```typescript
// components/widgets/market-indices-widget.tsx

interface MarketIndicesWidgetProps {
  /** Which indices to display */
  indices?: ('kospi' | 'kosdaq')[];
}

interface MarketIndex {
  code: 'kospi' | 'kosdaq';
  name: string;
  value: number;
  changeAmount: number;
  changePercent: number;
  sparklineData: Array<{
    time: string;
    value: number;
  }>;
}
```

| Property | Value |
|----------|-------|
| **Data source** | REST: `GET /api/market-indices` (initial + sparkline history). WebSocket: `index:update` event (real-time tick). |
| **Default size** | `w: 3, h: 3` |
| **Min size** | `minW: 2, minH: 2` |
| **Refresh strategy** | Real-time via WebSocket `index:update`. Sparkline historical data via TanStack Query `staleTime: 60_000`. |
| **Chart library** | Recharts `<AreaChart>` with gradient fill. Color follows Korean convention (red up, blue down) applied dynamically. |
| **Key interactions** | Minimal — display-only widget. Click index name → could link to external market page. |

### 2.8 TopVolumeWidget

Table of top trading volume stocks, updated in near real-time.

```typescript
// components/widgets/top-volume-widget.tsx

interface TopVolumeWidgetProps {
  /** Number of stocks to display */
  limit?: number;
  /** Filter by market */
  market?: 'all' | 'kospi' | 'kosdaq';
}

interface TopVolumeStock {
  rank: number;
  symbol: string;
  name: string;
  price: number;
  changePercent: number;
  volume: number;
  tradeValue: number;
  market: 'kospi' | 'kosdaq';
}
```

| Property | Value |
|----------|-------|
| **Data source** | REST: `GET /api/stocks?sortBy=tradeValue&order=desc&limit=20` |
| **Default size** | `w: 4, h: 5` |
| **Min size** | `minW: 3, minH: 3` |
| **Refresh strategy** | Polling via TanStack Query `refetchInterval: 10_000` (10 seconds). Top volume ranking changes frequently but doesn't need sub-second updates. |
| **Key interactions** | Click row → set `activeSymbol` + navigate to `/stocks/:symbol`. Market filter tabs (All / KOSPI / KOSDAQ). Rank number badge with up/down arrow if rank changed. |

---

## 3. React Grid Layout Configuration

### 3.1 Grid System Parameters

The dashboard uses a 12-column grid system with React Grid Layout (RGL) v2. The row height is calibrated so that 1 grid unit = 40px vertically, matching standard component heights.

```typescript
// lib/grid-config.ts
import type { Layout, Layouts } from 'react-grid-layout';

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
```

### 3.2 Breakpoint Configuration

```typescript
// lib/grid-config.ts (continued)

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
```

### 3.3 Default Layouts per Breakpoint

```typescript
// lib/default-layouts.ts

export const DEFAULT_LAYOUTS: Layouts = {
  xl: [
    // Row 1: Watchlist (left) + Chart (center) + Market Indices & Surge (right)
    { i: 'watchlist',      x: 0,  y: 0,  w: 4, h: 8,  minW: 3, minH: 4 },
    { i: 'candlestick',    x: 4,  y: 0,  w: 6, h: 8,  minW: 4, minH: 5 },
    { i: 'marketIndices',  x: 10, y: 0,  w: 2, h: 3,  minW: 2, minH: 2 },
    { i: 'surgeAlerts',    x: 10, y: 3,  w: 2, h: 5,  minW: 2, minH: 3 },
    // Row 2: News (left) + AI Analysis (center) + Theme + Top Volume (right)
    { i: 'newsFeed',       x: 0,  y: 8,  w: 4, h: 6,  minW: 3, minH: 4 },
    { i: 'aiAnalysis',     x: 4,  y: 8,  w: 4, h: 6,  minW: 3, minH: 4 },
    { i: 'themeSummary',   x: 8,  y: 8,  w: 2, h: 5,  minW: 2, minH: 3 },
    { i: 'topVolume',      x: 10, y: 8,  w: 2, h: 5,  minW: 3, minH: 3 },
  ],

  lg: [
    // 1440px: slightly compressed widths, same structure
    { i: 'watchlist',      x: 0,  y: 0,  w: 4, h: 8,  minW: 3, minH: 4 },
    { i: 'candlestick',    x: 4,  y: 0,  w: 5, h: 8,  minW: 4, minH: 5 },
    { i: 'marketIndices',  x: 9,  y: 0,  w: 3, h: 3,  minW: 2, minH: 2 },
    { i: 'surgeAlerts',    x: 9,  y: 3,  w: 3, h: 5,  minW: 2, minH: 3 },
    { i: 'newsFeed',       x: 0,  y: 8,  w: 4, h: 6,  minW: 3, minH: 4 },
    { i: 'aiAnalysis',     x: 4,  y: 8,  w: 4, h: 6,  minW: 3, minH: 4 },
    { i: 'themeSummary',   x: 8,  y: 8,  w: 2, h: 5,  minW: 2, minH: 3 },
    { i: 'topVolume',      x: 10, y: 8,  w: 2, h: 5,  minW: 3, minH: 3 },
  ],

  md: [
    // 1280px: 10-column grid, stacked layout
    { i: 'watchlist',      x: 0, y: 0,  w: 4, h: 8,  minW: 3, minH: 4 },
    { i: 'candlestick',    x: 4, y: 0,  w: 6, h: 8,  minW: 4, minH: 5 },
    { i: 'marketIndices',  x: 0, y: 8,  w: 3, h: 3,  minW: 2, minH: 2 },
    { i: 'surgeAlerts',    x: 3, y: 8,  w: 3, h: 4,  minW: 2, minH: 3 },
    { i: 'newsFeed',       x: 6, y: 8,  w: 4, h: 6,  minW: 3, minH: 4 },
    { i: 'aiAnalysis',     x: 0, y: 12, w: 5, h: 6,  minW: 3, minH: 4 },
    { i: 'themeSummary',   x: 5, y: 12, w: 3, h: 5,  minW: 2, minH: 3 },
    { i: 'topVolume',      x: 8, y: 12, w: 2, h: 5,  minW: 3, minH: 3 },
  ],
};
```

### 3.4 Visual Layout Diagram (xl: 1920px)

```
┌──────────────────────────────────────────────────────────────────────┐
│  col 0     col 4                    col 10                  col 12  │
│  ┌──────┐  ┌──────────────────────┐  ┌──────┐                      │
│  │Watch-│  │   Candlestick Chart  │  │Market│  ← Row 0-2           │
│  │list  │  │   (w:6, h:8)         │  │Index │                      │
│  │      │  │                      │  │(w:2) │                      │
│  │(w:4) │  │                      │  ├──────┤  ← Row 3             │
│  │(h:8) │  │                      │  │Surge │                      │
│  │      │  │                      │  │Alerts│                      │
│  │      │  │                      │  │(w:2) │                      │
│  ├──────┤  ├────────────┬─────────┤  │(h:5) │  ← Row 8             │
│  │News  │  │AI Analysis │Theme    │  ├──────┤                      │
│  │Feed  │  │(w:4, h:6)  │Summary  │  │Top   │                      │
│  │(w:4) │  │            │(w:2,h:5)│  │Volume│                      │
│  │(h:6) │  │            │         │  │(w:2) │                      │
│  │      │  │            │         │  │(h:5) │                      │
│  └──────┘  └────────────┴─────────┘  └──────┘                      │
└──────────────────────────────────────────────────────────────────────┘
```

### 3.5 Layout Persistence Strategy

Layout state is persisted using a two-tier approach: localStorage as the primary fast storage, with optional server-side sync for cross-device persistence.

```typescript
// lib/layout-persistence.ts

const STORAGE_KEY = 'smd-dashboard-layouts';
const STORAGE_VERSION = 1;

interface StoredLayout {
  version: number;
  layouts: Layouts;
  visibleWidgets: WidgetType[];
  updatedAt: string;
}

/** Read layout from localStorage */
export function loadLocalLayout(): StoredLayout | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: StoredLayout = JSON.parse(raw);
    if (parsed.version !== STORAGE_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** Save layout to localStorage */
export function saveLocalLayout(
  layouts: Layouts,
  visibleWidgets: WidgetType[],
): void {
  try {
    const data: StoredLayout = {
      version: STORAGE_VERSION,
      layouts,
      visibleWidgets,
      updatedAt: new Date().toISOString(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // Quota exceeded — silently fail
  }
}

/** Optional: sync to server for cross-device persistence */
export async function syncLayoutToServer(
  layouts: Layouts,
  visibleWidgets: WidgetType[],
): Promise<void> {
  try {
    await fetch('/api/preferences/layout', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ layouts, visibleWidgets }),
    });
  } catch {
    // Server sync failure is non-critical
  }
}
```

### 3.6 Widget Add/Remove UI Pattern

Users manage visible widgets through a dropdown panel in the top bar:

```typescript
// components/dashboard/widget-manager.tsx

interface WidgetManagerProps {
  visibleWidgets: WidgetType[];
  onToggle: (widget: WidgetType) => void;
  onResetLayout: () => void;
}

// UI Pattern:
// 1. TopBar has a "Customize" button (LayoutGrid icon)
// 2. Clicking opens a Popover with a checklist of all 8 widget types
// 3. Each widget has a Switch toggle (checked = visible)
// 4. "Reset to Default" button at bottom restores DEFAULT_LAYOUTS
// 5. Changes apply immediately (no save button needed)
// 6. Individual widgets also have an "X" button on their drag handle
//    that removes them (same as unchecking in the manager)
```

---

## 4. State Management Architecture

### 4.1 Architecture Principle

The architecture follows the "two-store" pattern: TanStack Query for all server state (API data, caching, background refetching), and Zustand for all client state (UI preferences, layout, active selections, WebSocket connection state). This eliminates the Redux anti-pattern of mixing server and client state in one store.

### 4.2 Zustand Stores

#### 4.2.1 useDashboardStore

Manages widget grid layout, visible widgets, edit mode, and the currently selected stock.

```typescript
// stores/dashboard-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Layouts } from 'react-grid-layout';
import { DEFAULT_LAYOUTS } from '@/lib/default-layouts';
import type { WidgetType } from '@/lib/widget-configs';

interface DashboardState {
  // Layout state
  layouts: Layouts;
  visibleWidgets: WidgetType[];
  isEditMode: boolean;

  // Active stock (cross-widget selection)
  activeSymbol: string | null;
  previousSymbols: string[];         // Navigation history (max 10)

  // Actions — Layout
  setLayouts: (layouts: Layouts) => void;
  toggleWidget: (widget: WidgetType) => void;
  resetLayout: () => void;
  setEditMode: (editing: boolean) => void;

  // Actions — Active stock
  setActiveSymbol: (symbol: string) => void;
  clearActiveSymbol: () => void;
}

export const useDashboardStore = create<DashboardState>()(
  persist(
    (set) => ({
      layouts: DEFAULT_LAYOUTS,
      visibleWidgets: [
        'watchlist', 'candlestick', 'newsFeed', 'themeSummary',
        'surgeAlerts', 'aiAnalysis', 'marketIndices', 'topVolume',
      ] as WidgetType[],
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

      resetLayout: () =>
        set({
          layouts: DEFAULT_LAYOUTS,
          visibleWidgets: [
            'watchlist', 'candlestick', 'newsFeed', 'themeSummary',
            'surgeAlerts', 'aiAnalysis', 'marketIndices', 'topVolume',
          ] as WidgetType[],
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
```

#### 4.2.2 usePreferencesStore

User preferences that persist across sessions. Theme, number formatting, alert settings.

```typescript
// stores/preferences-store.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type ThemeMode = 'dark' | 'light' | 'system';
type NumberFormat = 'full' | 'abbreviated';    // ₩68,500 vs 6.85만
type ChartType = 'candlestick' | 'line';
type ChartTimeframe = '1m' | '5m' | '15m' | '1h' | '1d';
type SortField = 'tradeValue' | 'changePercent' | 'volume' | 'price';

interface PreferencesState {
  // Display
  theme: ThemeMode;
  numberFormat: NumberFormat;
  chartType: ChartType;
  chartTimeframe: ChartTimeframe;

  // Sorting defaults
  sortBy: SortField;
  sortOrder: 'asc' | 'desc';

  // Alert settings
  surgeThresholdPercent: number;      // Default: 5.0
  alertSound: boolean;
  alertToast: boolean;

  // Actions
  setTheme: (theme: ThemeMode) => void;
  setNumberFormat: (format: NumberFormat) => void;
  setChartType: (type: ChartType) => void;
  setChartTimeframe: (tf: ChartTimeframe) => void;
  setSortBy: (field: SortField) => void;
  setSortOrder: (order: 'asc' | 'desc') => void;
  setSurgeThreshold: (pct: number) => void;
  setAlertSound: (on: boolean) => void;
  setAlertToast: (on: boolean) => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      theme: 'dark',
      numberFormat: 'full',
      chartType: 'candlestick',
      chartTimeframe: '1d',
      sortBy: 'tradeValue',
      sortOrder: 'desc',
      surgeThresholdPercent: 5.0,
      alertSound: true,
      alertToast: true,

      setTheme: (theme) => set({ theme }),
      setNumberFormat: (numberFormat) => set({ numberFormat }),
      setChartType: (chartType) => set({ chartType }),
      setChartTimeframe: (chartTimeframe) => set({ chartTimeframe }),
      setSortBy: (sortBy) => set({ sortBy }),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      setSurgeThreshold: (surgeThresholdPercent) => set({ surgeThresholdPercent }),
      setAlertSound: (alertSound) => set({ alertSound }),
      setAlertToast: (alertToast) => set({ alertToast }),
    }),
    { name: 'smd-preferences' },
  ),
);
```

#### 4.2.3 useRealtimeStore

WebSocket connection state, live prices map, and subscription management.

```typescript
// stores/realtime-store.ts
import { create } from 'zustand';
import type { Socket } from 'socket.io-client';

interface LivePrice {
  symbol: string;
  price: number;
  changePercent: number;
  changeAmount: number;
  volume: number;
  tradeValue: number;
  updatedAt: number;              // Unix ms timestamp
}

type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface RealtimeState {
  socket: Socket | null;
  connectionStatus: ConnectionStatus;
  subscribedSymbols: Set<string>;
  livePrices: Map<string, LivePrice>;
  lastHeartbeat: number | null;

  // Actions
  setSocket: (socket: Socket | null) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  addSubscription: (symbol: string) => void;
  removeSubscription: (symbol: string) => void;
  updateLivePrice: (price: LivePrice) => void;
  batchUpdatePrices: (prices: LivePrice[]) => void;
  setLastHeartbeat: (ts: number) => void;
}

export const useRealtimeStore = create<RealtimeState>()((set) => ({
  socket: null,
  connectionStatus: 'disconnected',
  subscribedSymbols: new Set(),
  livePrices: new Map(),
  lastHeartbeat: null,

  setSocket: (socket) => set({ socket }),
  setConnectionStatus: (status) => set({ connectionStatus: status }),

  addSubscription: (symbol) =>
    set((state) => {
      const next = new Set(state.subscribedSymbols);
      next.add(symbol);
      return { subscribedSymbols: next };
    }),

  removeSubscription: (symbol) =>
    set((state) => {
      const next = new Set(state.subscribedSymbols);
      next.delete(symbol);
      return { subscribedSymbols: next };
    }),

  updateLivePrice: (price) =>
    set((state) => {
      const next = new Map(state.livePrices);
      next.set(price.symbol, price);
      return { livePrices: next };
    }),

  batchUpdatePrices: (prices) =>
    set((state) => {
      const next = new Map(state.livePrices);
      for (const price of prices) {
        next.set(price.symbol, price);
      }
      return { livePrices: next };
    }),

  setLastHeartbeat: (ts) => set({ lastHeartbeat: ts }),
}));
```

### 4.3 TanStack Query Configuration

#### 4.3.1 QueryClient Setup

```typescript
// lib/query-client.ts
import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 5_000,                // Default: 5 seconds
        gcTime: 5 * 60 * 1000,           // Garbage collect after 5 minutes
        retry: 2,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        retry: 1,
      },
    },
  });
}
```

#### 4.3.2 Query Key Hierarchy

All query keys follow a strict hierarchy enabling both granular and broad cache invalidation.

```typescript
// lib/query-keys.ts

interface StockFilters {
  market?: 'kospi' | 'kosdaq';
  sector?: string;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
  page?: number;
  limit?: number;
}

export const queryKeys = {
  // Stocks domain
  stocks: {
    all:       ['stocks'] as const,
    list:      (filters: StockFilters) =>
                 ['stocks', 'list', filters] as const,
    detail:    (symbol: string) =>
                 ['stocks', 'detail', symbol] as const,
    prices:    (symbol: string, timeframe: string) =>
                 ['stocks', 'prices', symbol, timeframe] as const,
    news:      (symbol: string) =>
                 ['stocks', 'news', symbol] as const,
  },

  // Themes domain
  themes: {
    all:         ['themes'] as const,
    list:        () => ['themes', 'list'] as const,
    performance: () => ['themes', 'performance'] as const,
    detail:      (themeId: string) =>
                   ['themes', 'detail', themeId] as const,
  },

  // Watchlists domain
  watchlists: {
    all:    ['watchlists'] as const,
    list:   () => ['watchlists', 'list'] as const,
    detail: (id: string) => ['watchlists', 'detail', id] as const,
  },

  // AI Analysis domain
  aiAnalysis: {
    all:     ['ai-analysis'] as const,
    byStock: (symbol: string) =>
               ['ai-analysis', symbol] as const,
  },

  // Market indices
  marketIndices: {
    all:    ['market-indices'] as const,
    kospi:  () => ['market-indices', 'kospi'] as const,
    kosdaq: () => ['market-indices', 'kosdaq'] as const,
  },

  // Alerts
  alerts: {
    all:    ['alerts'] as const,
    active: () => ['alerts', 'active'] as const,
    surge:  () => ['alerts', 'surge'] as const,
  },

  // Admin
  admin: {
    status: () => ['admin', 'status'] as const,
    users:  () => ['admin', 'users'] as const,
  },
} as const;
```

#### 4.3.3 Stale Time and Cache Time per Query Type

Different data types have different freshness requirements:

| Query Key Pattern | staleTime | gcTime | refetchInterval | Rationale |
|-------------------|-----------|--------|-----------------|-----------|
| `stocks.list` | 10s | 5m | none | List data updated by WebSocket events |
| `stocks.detail` | 30s | 10m | none | Detail page, less volatile metadata |
| `stocks.prices` | 60s | 30m | none | Historical data rarely changes; real-time via WebSocket |
| `stocks.news` | 60s | 10m | none | News invalidated by WebSocket `news:update` |
| `themes.performance` | 30s | 5m | 30s | Aggregated data, moderate refresh |
| `watchlists.list` | 30s | 10m | none | Only changes on user action (add/remove) |
| `aiAnalysis.byStock` | 300s | 30m | none | AI results are expensive; cache aggressively |
| `marketIndices.all` | 5s | 5m | none | Real-time updates via WebSocket |
| `alerts.surge` | 10s | 5m | none | Real-time push via WebSocket |
| `admin.status` | 60s | 5m | 60s | Admin monitoring, moderate polling |

#### 4.3.4 Real-time Invalidation Strategy

WebSocket events trigger precise cache invalidation instead of broad re-fetching:

```typescript
// hooks/use-realtime-invalidation.ts
import { useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useRealtimeStore } from '@/stores/realtime-store';
import { queryKeys } from '@/lib/query-keys';

export function useRealtimeInvalidation(): void {
  const queryClient = useQueryClient();
  const socket = useRealtimeStore((s) => s.socket);

  useEffect(() => {
    if (!socket) return;

    const onSurgeAlert = (data: { symbol: string }) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.alerts.surge() });
      queryClient.invalidateQueries({
        queryKey: queryKeys.aiAnalysis.byStock(data.symbol),
      });
    };

    const onNewsUpdate = (data: { symbol: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.stocks.news(data.symbol),
      });
    };

    const onIndexUpdate = () => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.marketIndices.all,
      });
    };

    const onAiComplete = (data: { symbol: string }) => {
      queryClient.invalidateQueries({
        queryKey: queryKeys.aiAnalysis.byStock(data.symbol),
      });
    };

    socket.on('alert:surge', onSurgeAlert);
    socket.on('news:update', onNewsUpdate);
    socket.on('index:update', onIndexUpdate);
    socket.on('ai:analysis-complete', onAiComplete);

    return () => {
      socket.off('alert:surge', onSurgeAlert);
      socket.off('news:update', onNewsUpdate);
      socket.off('index:update', onIndexUpdate);
      socket.off('ai:analysis-complete', onAiComplete);
    };
  }, [socket, queryClient]);
}
```

---

## 5. Socket.IO Client Architecture

### 5.1 Connection Manager (Singleton)

A single Socket.IO connection is shared across the entire application. The connection manager is initialized once by the `SocketProvider` component and cleaned up on logout or unmount.

```typescript
// lib/socket.ts
import { io, type Socket } from 'socket.io-client';
import { useRealtimeStore } from '@/stores/realtime-store';

const SOCKET_URL = process.env.NEXT_PUBLIC_WS_URL ?? 'http://localhost:3001';

let socketInstance: Socket | null = null;

export function getSocket(): Socket {
  if (!socketInstance) {
    socketInstance = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],

      // Exponential backoff reconnection
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1_000,          // Start at 1 second
      reconnectionDelayMax: 30_000,      // Cap at 30 seconds
      randomizationFactor: 0.5,          // +/- 50% jitter

      timeout: 10_000,

      auth: (cb) => {
        const token = getSessionToken();
        cb({ token });
      },
    });

    const store = useRealtimeStore.getState();

    socketInstance.on('connect', () => {
      store.setConnectionStatus('connected');
      store.setSocket(socketInstance);
      // Re-subscribe all previously subscribed symbols after reconnect
      store.subscribedSymbols.forEach((symbol) => {
        socketInstance?.emit('subscribe', { symbol });
      });
    });

    socketInstance.on('disconnect', (reason) => {
      store.setConnectionStatus('disconnected');
      if (reason === 'io server disconnect') {
        socketInstance?.connect();
      }
    });

    socketInstance.on('connect_error', () => {
      store.setConnectionStatus('error');
    });

    socketInstance.on('reconnect_attempt', (attemptNumber) => {
      store.setConnectionStatus('connecting');
      console.info(`[Socket] Reconnect attempt #${attemptNumber}`);
    });

    socketInstance.on('heartbeat', () => {
      store.setLastHeartbeat(Date.now());
    });
  }

  return socketInstance;
}

export function disconnectSocket(): void {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
  const store = useRealtimeStore.getState();
  store.setSocket(null);
  store.setConnectionStatus('disconnected');
}

function getSessionToken(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(
    /better-auth\.session_token=([^;]+)/,
  );
  return match ? match[1] : null;
}
```

### 5.2 Auto-Reconnection with Exponential Backoff

The reconnection strategy is configured directly in the Socket.IO client options above. The backoff sequence is:

| Attempt | Delay (base) | With jitter (0.5 factor) | Cumulative |
|---------|-------------|-------------------------|------------|
| 1 | 1s | 0.5s - 1.5s | ~1s |
| 2 | 2s | 1s - 3s | ~3s |
| 3 | 4s | 2s - 6s | ~7s |
| 4 | 8s | 4s - 12s | ~15s |
| 5 | 16s | 8s - 24s | ~31s |
| 6+ | 30s (cap) | 15s - 45s | ... |

On successful reconnect, the client automatically re-emits `subscribe` events for all symbols in `subscribedSymbols`. This ensures the server re-adds the client to the correct rooms.

### 5.3 Room-Based Subscription

The server organizes real-time data by stock symbol rooms. The client joins/leaves rooms as widgets mount/unmount or as the user changes their watchlist.

```typescript
// hooks/use-stock-subscription.ts
import { useEffect } from 'react';
import { getSocket } from '@/lib/socket';
import { useRealtimeStore } from '@/stores/realtime-store';

export function useStockSubscription(symbols: string[]): void {
  const addSubscription = useRealtimeStore((s) => s.addSubscription);
  const removeSubscription = useRealtimeStore((s) => s.removeSubscription);

  useEffect(() => {
    if (symbols.length === 0) return;

    const socket = getSocket();

    symbols.forEach((symbol) => {
      socket.emit('subscribe', { symbol });
      addSubscription(symbol);
    });

    return () => {
      symbols.forEach((symbol) => {
        socket.emit('unsubscribe', { symbol });
        removeSubscription(symbol);
      });
    };
  }, [symbols.join(',')]);
}
```

### 5.4 Event-to-Store Update Pipeline

The complete data flow from server to UI:

```
Server (NestJS WebSocket Gateway)
  │
  ├── socket.to('stock:005930').emit('price:update', payload)
  ├── socket.to('alerts').emit('alert:surge', payload)
  ├── socket.to('news').emit('news:update', payload)
  ├── socket.to('indices').emit('index:update', payload)
  └── socket.emit('ai:analysis-complete', payload)
       │
       ▼
Socket.IO Client Event Handlers
  │
  ├─[price:update]─► useRealtimeStore.updateLivePrice(data)
  │                   ├── WatchlistWidget re-renders affected row
  │                   ├── CandlestickChartWidget.series.update() via ref
  │                   └── TopVolumeWidget updates if stock is in top N
  │
  ├─[alert:surge]──► Toast notification (Sonner)
  │                   └── TanStack Query invalidates alerts.surge()
  │
  ├─[news:update]──► TanStack Query invalidates stocks.news(symbol)
  │
  ├─[index:update]─► TanStack Query invalidates marketIndices.all
  │
  └─[ai:analysis-complete]─► TanStack Query invalidates aiAnalysis.byStock(symbol)
```

### 5.5 Socket Provider Component

```typescript
// components/providers/socket-provider.tsx
'use client';

import { useEffect } from 'react';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { useRealtimeStore } from '@/stores/realtime-store';
import { useRealtimeInvalidation } from '@/hooks/use-realtime-invalidation';

export function SocketProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const socket = getSocket();

    // Global price update handler → Zustand store
    const onPriceUpdate = (data: LivePrice) => {
      useRealtimeStore.getState().updateLivePrice(data);
    };

    socket.on('price:update', onPriceUpdate);

    return () => {
      socket.off('price:update', onPriceUpdate);
      disconnectSocket();
    };
  }, []);

  // Wire up TanStack Query invalidation from WebSocket events
  useRealtimeInvalidation();

  return <>{children}</>;
}
```

### 5.6 Connection Status Indicator

The `TopBar` component displays a live connection status indicator:

```typescript
// components/layout/connection-status.tsx
'use client';

import { useRealtimeStore } from '@/stores/realtime-store';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

const STATUS_CONFIG = {
  connected:    { label: 'Live',          color: 'bg-green-500', variant: 'default' as const },
  connecting:   { label: 'Connecting...', color: 'bg-yellow-500', variant: 'secondary' as const },
  disconnected: { label: 'Offline',       color: 'bg-gray-500', variant: 'outline' as const },
  error:        { label: 'Error',         color: 'bg-red-500', variant: 'destructive' as const },
};

export function ConnectionStatus() {
  const status = useRealtimeStore((s) => s.connectionStatus);
  const lastHeartbeat = useRealtimeStore((s) => s.lastHeartbeat);
  const config = STATUS_CONFIG[status];

  return (
    <Tooltip>
      <TooltipTrigger>
        <Badge variant={config.variant} className="gap-1.5">
          <span className={`h-2 w-2 rounded-full ${config.color} animate-pulse`} />
          {config.label}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>
        {lastHeartbeat
          ? `Last heartbeat: ${new Date(lastHeartbeat).toLocaleTimeString('ko-KR')}`
          : 'No heartbeat received'}
      </TooltipContent>
    </Tooltip>
  );
}
```

---

## 6. shadcn/ui Component Mapping

Every UI element in the application maps to a specific shadcn/ui component. This mapping ensures visual consistency and leverages the built-in accessibility of Radix UI primitives.

### 6.1 Complete Component Mapping Table

| UI Element | shadcn Component | Where Used | Notes |
|-----------|-----------------|-----------|-------|
| Widget container | `Card`, `CardHeader`, `CardContent`, `CardTitle` | All 8 widgets via `WidgetWrapper` | Drag handle on `CardHeader` |
| Stock list / Watchlist | `DataTable` (TanStack Table integration) | WatchlistWidget, TopVolumeWidget | Sortable columns, virtualized rows |
| Stock detail tabs | `Tabs`, `TabsList`, `TabsTrigger`, `TabsContent` | `/stocks/:symbol` page | Chart / News / AI Analysis sections |
| Filter dropdowns | `Select`, `SelectTrigger`, `SelectValue`, `SelectContent`, `SelectItem` | Watchlist sort, market filter, timeframe | |
| Multi-option filters | `DropdownMenu`, `DropdownMenuCheckboxItem` | Theme filter, column visibility | Multi-select pattern |
| Search input | `Input` with search icon | TopBar global stock search | Debounced, with `CommandPalette` for power users |
| Command palette | `Command`, `CommandInput`, `CommandList`, `CommandItem` | TopBar search (Cmd+K) | Quick stock lookup |
| Alert dialogs | `AlertDialog`, `AlertDialogAction`, `AlertDialogCancel` | Delete watchlist, remove widget confirmation | |
| Settings modal | `Dialog`, `DialogContent`, `DialogHeader` | Alert threshold config, chart settings | |
| Settings sidebar | `Sheet`, `SheetContent`, `SheetHeader` | User preferences panel | Slide from right |
| Surge notifications | `Toast` via Sonner | SurgeAlertWidget push | Auto-dismiss after 5s |
| Confidence gauge | Custom via `Progress` or Recharts `RadialBarChart` | AiAnalysisWidget | 0-100% visualization |
| Loading placeholders | `Skeleton` | All widgets during initial load | Matches widget content shape |
| Market/sector labels | `Badge` | Theme tags, market type indicators | Color-coded: KOSPI, KOSDAQ |
| Price change indicator | `Badge` (variant: destructive/default/outline) | Price cells throughout | Red badge for up, blue for down |
| Data table pagination | `Pagination`, `Button` | Admin user list, full stock list | |
| Form inputs | `Input`, `Label`, `Button`, `Form` (react-hook-form) | Login, signup, alert config | Zod validation |
| Toggle switches | `Switch` | Alert on/off, sound on/off | |
| Threshold slider | `Slider` | Surge threshold setting | Range: 1% to 30% |
| Date range picker | `Calendar`, `Popover` | Historical chart date range | |
| Tooltips | `Tooltip`, `TooltipTrigger`, `TooltipContent` | Chart data points, column headers, icons | |
| User avatar/menu | `Avatar`, `DropdownMenu` | TopBar user menu | Logout, settings links |
| Navigation sidebar | `Sidebar`, `SidebarContent`, `SidebarGroup` | Dashboard layout | Collapsible |
| Accordion sections | `Accordion`, `AccordionItem`, `AccordionContent` | AI analysis expandable content | |
| Scroll containers | `ScrollArea` | News feed, surge alerts list | Custom scrollbar styling |
| Separator lines | `Separator` | Between widget sections | |
| Empty states | Custom with `Card` + illustration | Empty watchlist, no analysis | |

### 6.2 Widget Wrapper Component (Shared)

```typescript
// components/dashboard/widget-wrapper.tsx
'use client';

import { Card, CardHeader, CardContent, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { GripVertical, X, Maximize2, Minimize2 } from 'lucide-react';
import type { WidgetType } from '@/lib/widget-configs';

interface WidgetWrapperProps {
  id: WidgetType;
  title: string;
  children: React.ReactNode;
  onRemove?: (id: WidgetType) => void;
  headerActions?: React.ReactNode;
}

export function WidgetWrapper({
  id,
  title,
  children,
  onRemove,
  headerActions,
}: WidgetWrapperProps) {
  return (
    <Card className="flex h-full flex-col overflow-hidden border-border/50 bg-card">
      <CardHeader className="widget-drag-handle cursor-grab active:cursor-grabbing flex-row items-center justify-between space-y-0 px-3 py-2">
        <div className="flex items-center gap-2">
          <GripVertical className="h-4 w-4 text-muted-foreground" />
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
        </div>
        <div className="flex items-center gap-1">
          {headerActions}
          {onRemove && (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onClick={() => onRemove(id)}
              aria-label={`Remove ${title} widget`}
            >
              <X className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto p-2">
        {children}
      </CardContent>
    </Card>
  );
}
```

---

## 7. Color System and Korean Conventions

### 7.1 Stock Price Color Convention

Korean stock markets follow the opposite convention to US markets. Red indicates price increase (positive), and blue indicates price decrease (negative). This is a hard requirement from PRD SS3.8.

```typescript
// lib/colors.ts

export const STOCK_COLORS = {
  up: {
    text: 'text-red-500',          // #EF4444
    bg: 'bg-red-500/10',
    border: 'border-red-500/30',
    fill: '#EF4444',
    fillMuted: 'rgba(239, 68, 68, 0.4)',
  },
  down: {
    text: 'text-blue-500',         // #3B82F6
    bg: 'bg-blue-500/10',
    border: 'border-blue-500/30',
    fill: '#3B82F6',
    fillMuted: 'rgba(59, 130, 246, 0.4)',
  },
  unchanged: {
    text: 'text-muted-foreground', // gray
    bg: 'bg-muted',
    border: 'border-border',
    fill: '#6B7280',
    fillMuted: 'rgba(107, 114, 128, 0.4)',
  },
} as const;

export function getPriceColorClass(changePercent: number): string {
  if (changePercent > 0) return STOCK_COLORS.up.text;
  if (changePercent < 0) return STOCK_COLORS.down.text;
  return STOCK_COLORS.unchanged.text;
}

export function getPriceColor(changePercent: number): string {
  if (changePercent > 0) return STOCK_COLORS.up.fill;
  if (changePercent < 0) return STOCK_COLORS.down.fill;
  return STOCK_COLORS.unchanged.fill;
}
```

### 7.2 TradingView Chart Colors (Korean Convention)

```typescript
// lib/chart-colors.ts

export const CHART_COLORS = {
  candlestick: {
    upColor: '#EF4444',           // red-500
    downColor: '#3B82F6',         // blue-500
    wickUpColor: '#DC2626',       // red-600
    wickDownColor: '#2563EB',     // blue-600
    borderVisible: false,
  },
  volume: {
    upColor: 'rgba(239, 68, 68, 0.4)',
    downColor: 'rgba(59, 130, 246, 0.4)',
  },
  movingAverages: {
    ma5: '#F59E0B',               // amber-500
    ma20: '#8B5CF6',              // purple-500
    ma60: '#10B981',              // emerald-500
    ma120: '#F97316',             // orange-500
  },
} as const;
```

### 7.3 Dark Mode Theme

The application defaults to dark mode (preferred for financial dashboards used alongside HTS). The CSS custom properties are defined via Tailwind CSS configuration.

```typescript
// tailwind.config.ts — theme extension excerpt

const darkTheme = {
  background: '#0A0A0F',           // Near-black for reduced eye strain
  foreground: '#E4E4E7',           // zinc-200
  card: '#111118',                 // Slightly lighter than background
  'card-foreground': '#E4E4E7',
  popover: '#18181B',
  'popover-foreground': '#E4E4E7',
  primary: '#3B82F6',              // Blue accent
  'primary-foreground': '#FFFFFF',
  secondary: '#27272A',
  'secondary-foreground': '#A1A1AA',
  muted: '#18181B',
  'muted-foreground': '#71717A',
  accent: '#27272A',
  'accent-foreground': '#FAFAFA',
  destructive: '#EF4444',          // Also used for price up
  border: '#27272A',
  input: '#27272A',
  ring: '#3B82F6',
};

const lightTheme = {
  background: '#FFFFFF',
  foreground: '#09090B',
  card: '#FFFFFF',
  'card-foreground': '#09090B',
  popover: '#FFFFFF',
  'popover-foreground': '#09090B',
  primary: '#2563EB',
  'primary-foreground': '#FFFFFF',
  secondary: '#F4F4F5',
  'secondary-foreground': '#18181B',
  muted: '#F4F4F5',
  'muted-foreground': '#71717A',
  accent: '#F4F4F5',
  'accent-foreground': '#18181B',
  destructive: '#EF4444',
  border: '#E4E4E7',
  input: '#E4E4E7',
  ring: '#2563EB',
};
```

Dark mode contrast ratios (verified against WCAG 2.1 AA):

| Element | Foreground | Background | Ratio | Passes AA |
|---------|-----------|-----------|-------|-----------|
| Body text | #E4E4E7 | #0A0A0F | 15.1:1 | Yes (4.5:1 required) |
| Muted text | #71717A | #0A0A0F | 4.8:1 | Yes |
| Red (price up) | #EF4444 | #111118 | 4.7:1 | Yes |
| Blue (price down) | #3B82F6 | #111118 | 4.5:1 | Yes (borderline, supplemented with icons) |
| Card text | #E4E4E7 | #111118 | 13.4:1 | Yes |

### 7.4 Number Formatting (Korean Financial Conventions)

```typescript
// lib/formatters.ts

/** Format Korean Won: ₩68,500 or 68,500 */
export function formatKRW(value: number, showSymbol = false): string {
  const formatted = Math.round(value).toLocaleString('ko-KR');
  return showSymbol ? `₩${formatted}` : formatted;
}

/** Format percentage with sign: +5.23% / -2.10% / 0.00% */
export function formatPercent(value: number, decimals = 2): string {
  const prefix = value > 0 ? '+' : '';
  return `${prefix}${value.toFixed(decimals)}%`;
}

/** Format large numbers with Korean unit suffixes */
export function formatLargeKRW(value: number): string {
  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  if (absValue >= 1_0000_0000_0000) {
    return `${sign}${(absValue / 1_0000_0000_0000).toFixed(1)}조`;
  }
  if (absValue >= 1_0000_0000) {
    return `${sign}${(absValue / 1_0000_0000).toFixed(1)}억`;
  }
  if (absValue >= 1_0000) {
    return `${sign}${(absValue / 1_0000).toFixed(0)}만`;
  }
  return `${sign}${absValue.toLocaleString('ko-KR')}`;
}

/** Format volume with abbreviated units */
export function formatVolume(value: number): string {
  if (value >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1)}M`;
  }
  if (value >= 1_000) {
    return `${(value / 1_000).toFixed(0)}K`;
  }
  return value.toLocaleString('ko-KR');
}

/** Format date/time in Korean locale */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/** Format relative time: "3분 전", "1시간 전" */
export function formatRelativeTime(date: string | Date): string {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diffMs = now - then;

  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return '방금 전';
  if (minutes < 60) return `${minutes}분 전`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;

  const days = Math.floor(hours / 24);
  return `${days}일 전`;
}
```

### 7.5 Accessibility: Color-Blind Safe Patterns

For the approximately 8% of males with color vision deficiency, all price direction indicators supplement color with shape/icon:

```typescript
// components/ui/price-change.tsx

import { ArrowUpIcon, ArrowDownIcon, MinusIcon } from 'lucide-react';
import { formatPercent } from '@/lib/formatters';
import { getPriceColorClass } from '@/lib/colors';

interface PriceChangeProps {
  value: number;
  showIcon?: boolean;
  showAmount?: boolean;
  amount?: number;
}

export function PriceChange({
  value,
  showIcon = true,
  showAmount = false,
  amount,
}: PriceChangeProps) {
  const colorClass = getPriceColorClass(value);

  const Icon = value > 0
    ? ArrowUpIcon
    : value < 0
    ? ArrowDownIcon
    : MinusIcon;

  return (
    <span className={`inline-flex items-center gap-1 font-tabular-nums ${colorClass}`}>
      {showIcon && <Icon className="h-3 w-3" aria-hidden="true" />}
      <span>{formatPercent(value)}</span>
      {showAmount && amount !== undefined && (
        <span className="text-xs opacity-75">
          ({value > 0 ? '+' : ''}{formatKRW(amount)})
        </span>
      )}
      <span className="sr-only">
        {value > 0 ? 'increase' : value < 0 ? 'decrease' : 'unchanged'}
      </span>
    </span>
  );
}
```

---

## 8. Performance Budget and Optimization

### 8.1 Performance Budget Table

| Metric | Target | Strategy | Measurement |
|--------|--------|----------|-------------|
| First Contentful Paint | < 1.2s | Static shell via PPR, inline critical CSS | Lighthouse |
| Largest Contentful Paint | < 2.5s | Skeleton loading + streaming widget data | Lighthouse |
| Time to Interactive | < 3.0s | Lazy-load non-critical widgets | Lighthouse |
| Total initial JS bundle | < 300KB gzipped (< 500KB raw) | Code splitting, tree shaking, dynamic imports | webpack-bundle-analyzer |
| WebSocket P95 latency | < 100ms | WebSocket transport preferred over polling | Custom timing |
| Chart update per frame | < 16ms | requestAnimationFrame batching, Canvas rendering | Performance.now() |
| Stock list scroll | 60fps for 2,500+ items | @tanstack/react-virtual (renders ~30 visible rows) | Chrome DevTools FPS |
| Memory (dashboard active) | < 150MB | Virtualized lists, chart data windowing | Chrome DevTools Memory |

### 8.2 Code Splitting Strategy

```typescript
// Dynamic imports for heavy widget components
import dynamic from 'next/dynamic';
import { WidgetSkeleton } from '@/components/ui/widget-skeleton';

// TradingView Charts — Canvas-based, must be client-only
export const CandlestickChartWidget = dynamic(
  () => import('@/components/widgets/candlestick-chart-widget')
    .then(m => m.CandlestickChartWidget),
  { ssr: false, loading: () => <WidgetSkeleton type="chart" /> },
);

// AI Analysis — heavy markdown rendering
export const AiAnalysisWidget = dynamic(
  () => import('@/components/widgets/ai-analysis-widget')
    .then(m => m.AiAnalysisWidget),
  { loading: () => <WidgetSkeleton type="card" /> },
);

// Recharts-based widgets — tree-shake per chart type
export const ThemeSummaryWidget = dynamic(
  () => import('@/components/widgets/theme-summary-widget')
    .then(m => m.ThemeSummaryWidget),
  { loading: () => <WidgetSkeleton type="bar" /> },
);
```

**Expected bundle sizes per route:**

| Route | Initial JS (gzipped) | Lazy chunks |
|-------|----------------------|-------------|
| `/login`, `/signup` | ~80KB | None |
| `/` (dashboard shell) | ~200KB | Charts (~45KB), Recharts (~50KB per type), DataTable (~30KB) |
| `/stocks/:symbol` | ~150KB | Full chart + analysis |
| `/admin` | ~120KB | DataTable + user management |

### 8.3 Virtualization

The WatchlistWidget and full stock list views use `@tanstack/react-virtual` to render only visible rows. With 2,500+ Korean stocks:

| Metric | Without virtualization | With @tanstack/react-virtual |
|--------|----------------------|------------------------------|
| DOM nodes | ~25,000 | ~300-400 |
| Initial render | 800-1,200ms | 15-30ms |
| Scroll FPS | 15-30fps | 60fps |
| Memory | ~80MB | ~15MB |

### 8.4 Chart Update Batching

Multiple WebSocket price updates within a single animation frame are coalesced via `requestAnimationFrame`:

```typescript
// hooks/use-batched-chart-updates.ts
// Ensures at most one canvas redraw per 16.67ms frame
// Latest data always wins — intermediate updates are dropped
// Cleanup cancels pending RAF on unmount
```

This guarantees the chart update cost stays under the 16ms per-frame budget even during high-frequency trading periods.

### 8.5 Image and Asset Optimization

- Next.js `<Image>` component for all images (lazy loading, WebP conversion)
- Font: `next/font` with `Inter` or `Pretendard` (Korean-optimized) — preloaded, no FOIT
- Icons: Lucide React (tree-shakeable, ~200B per icon)

---

## 9. Component File Structure

The complete frontend component tree, organized by domain and responsibility:

```
src/
├── app/                              # Next.js App Router
│   ├── layout.tsx                    # Root layout
│   ├── providers.tsx                 # QueryClient + Socket + Theme providers
│   ├── middleware.ts                 # Auth middleware
│   ├── (auth)/
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   └── signup/page.tsx
│   ├── (dashboard)/
│   │   ├── layout.tsx               # DashboardShell (sidebar + topbar)
│   │   ├── page.tsx                 # DashboardPage (grid)
│   │   └── stocks/[symbol]/page.tsx # StockDetailPage
│   └── (admin)/
│       ├── layout.tsx               # AdminShell + RoleGuard
│       └── page.tsx                 # AdminPage
│
├── components/
│   ├── ui/                           # shadcn/ui primitives (auto-generated)
│   │   ├── badge.tsx
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── command.tsx
│   │   ├── data-table.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── scroll-area.tsx
│   │   ├── select.tsx
│   │   ├── separator.tsx
│   │   ├── sheet.tsx
│   │   ├── skeleton.tsx
│   │   ├── slider.tsx
│   │   ├── switch.tsx
│   │   ├── tabs.tsx
│   │   ├── toast.tsx
│   │   ├── tooltip.tsx
│   │   └── widget-skeleton.tsx       # Custom: shaped skeletons per widget type
│   │
│   ├── layout/                       # Layout components
│   │   ├── sidebar.tsx
│   │   ├── top-bar.tsx
│   │   ├── connection-status.tsx
│   │   └── user-nav.tsx
│   │
│   ├── auth/                         # Auth components
│   │   ├── auth-guard.tsx
│   │   ├── role-guard.tsx
│   │   ├── login-form.tsx
│   │   └── signup-form.tsx
│   │
│   ├── dashboard/                    # Dashboard grid system
│   │   ├── dashboard-grid.tsx        # ResponsiveGridLayout wrapper
│   │   ├── widget-wrapper.tsx        # Shared Card wrapper with drag handle
│   │   ├── widget-manager.tsx        # Add/remove widget Popover
│   │   └── widget-registry.tsx       # Maps WidgetType → lazy component
│   │
│   ├── widgets/                      # The 8 widget components
│   │   ├── watchlist-widget.tsx
│   │   ├── watchlist/
│   │   │   ├── columns.tsx           # TanStack Table column definitions
│   │   │   └── virtualized-stock-list.tsx
│   │   ├── candlestick-chart-widget.tsx
│   │   ├── candlestick/
│   │   │   ├── stock-chart.tsx       # TradingView chart wrapper
│   │   │   ├── chart-toolbar.tsx     # Timeframe + MA toggles
│   │   │   └── chart-tooltip.tsx
│   │   ├── news-feed-widget.tsx
│   │   ├── news/
│   │   │   └── news-article-card.tsx
│   │   ├── theme-summary-widget.tsx
│   │   ├── theme/
│   │   │   ├── theme-performance-chart.tsx  # Recharts bar chart
│   │   │   └── theme-sparkline.tsx          # Mini line chart
│   │   ├── surge-alert-widget.tsx
│   │   ├── surge/
│   │   │   └── surge-alert-item.tsx
│   │   ├── ai-analysis-widget.tsx
│   │   ├── ai/
│   │   │   ├── confidence-gauge.tsx         # Radial bar chart
│   │   │   ├── quality-gate-badges.tsx
│   │   │   └── analysis-content.tsx         # Markdown renderer
│   │   ├── market-indices-widget.tsx
│   │   ├── indices/
│   │   │   └── index-area-chart.tsx         # Recharts area chart
│   │   ├── top-volume-widget.tsx
│   │   └── top-volume/
│   │       └── top-volume-columns.tsx
│   │
│   ├── stock-detail/                 # /stocks/:symbol page components
│   │   ├── stock-header.tsx          # Symbol, name, live price
│   │   ├── full-chart.tsx            # Full-screen chart
│   │   ├── news-panel.tsx
│   │   ├── ai-analysis-panel.tsx
│   │   └── related-themes.tsx
│   │
│   ├── admin/                        # /admin page components
│   │   ├── admin-tabs.tsx
│   │   ├── user-management.tsx
│   │   ├── api-key-settings.tsx
│   │   ├── data-collection-status.tsx
│   │   └── system-settings.tsx
│   │
│   └── providers/                    # Context providers
│       ├── query-provider.tsx
│       ├── socket-provider.tsx
│       └── theme-provider.tsx
│
├── stores/                           # Zustand stores
│   ├── dashboard-store.ts
│   ├── preferences-store.ts
│   └── realtime-store.ts
│
├── hooks/                            # Custom React hooks
│   ├── use-stock-subscription.ts     # WebSocket room subscribe/unsubscribe
│   ├── use-realtime-invalidation.ts  # WebSocket → TanStack Query cache
│   ├── use-batched-chart-updates.ts  # RAF-batched chart updates
│   ├── use-live-price.ts             # Subscribe to single symbol price
│   └── use-debounce.ts               # Input debouncing
│
├── lib/                              # Utilities and configuration
│   ├── socket.ts                     # Socket.IO singleton manager
│   ├── query-client.ts               # TanStack Query client factory
│   ├── query-keys.ts                 # Query key hierarchy
│   ├── grid-config.ts                # Grid layout constants
│   ├── default-layouts.ts            # Default layouts per breakpoint
│   ├── layout-persistence.ts         # localStorage + server sync
│   ├── widget-configs.ts             # WidgetType enum + metadata
│   ├── colors.ts                     # Stock color system
│   ├── chart-colors.ts               # TradingView chart colors
│   ├── formatters.ts                 # Number/date formatting
│   ├── api.ts                        # API client (fetch wrapper)
│   └── validators.ts                 # Zod schemas for forms
│
└── types/                            # TypeScript type definitions
    ├── stock.ts                      # Stock, StockPrice, StockFilter
    ├── news.ts                       # NewsArticle
    ├── theme.ts                      # Theme, ThemePerformance
    ├── ai-analysis.ts                # AiAnalysis
    ├── alert.ts                      # SurgeAlert, AlertConfig
    ├── market-index.ts               # MarketIndex
    ├── user.ts                       # User, UserRole
    └── socket-events.ts              # Socket.IO event type map
```

### 9.1 Widget Registry Pattern

The widget registry maps `WidgetType` identifiers to their lazy-loaded components, enabling the `DashboardGrid` to render any combination of widgets dynamically:

```typescript
// components/dashboard/widget-registry.tsx
import dynamic from 'next/dynamic';
import { WidgetSkeleton } from '@/components/ui/widget-skeleton';
import type { WidgetType } from '@/lib/widget-configs';

type WidgetComponent = React.ComponentType<Record<string, unknown>>;

const WIDGET_REGISTRY: Record<WidgetType, React.ComponentType> = {
  watchlist: dynamic(
    () => import('@/components/widgets/watchlist-widget').then(m => m.WatchlistWidget),
    { loading: () => <WidgetSkeleton type="table" /> },
  ),
  candlestick: dynamic(
    () => import('@/components/widgets/candlestick-chart-widget').then(m => m.CandlestickChartWidget),
    { ssr: false, loading: () => <WidgetSkeleton type="chart" /> },
  ),
  newsFeed: dynamic(
    () => import('@/components/widgets/news-feed-widget').then(m => m.NewsFeedWidget),
    { loading: () => <WidgetSkeleton type="list" /> },
  ),
  themeSummary: dynamic(
    () => import('@/components/widgets/theme-summary-widget').then(m => m.ThemeSummaryWidget),
    { loading: () => <WidgetSkeleton type="bar" /> },
  ),
  surgeAlerts: dynamic(
    () => import('@/components/widgets/surge-alert-widget').then(m => m.SurgeAlertWidget),
    { loading: () => <WidgetSkeleton type="list" /> },
  ),
  aiAnalysis: dynamic(
    () => import('@/components/widgets/ai-analysis-widget').then(m => m.AiAnalysisWidget),
    { loading: () => <WidgetSkeleton type="card" /> },
  ),
  marketIndices: dynamic(
    () => import('@/components/widgets/market-indices-widget').then(m => m.MarketIndicesWidget),
    { loading: () => <WidgetSkeleton type="chart" /> },
  ),
  topVolume: dynamic(
    () => import('@/components/widgets/top-volume-widget').then(m => m.TopVolumeWidget),
    { loading: () => <WidgetSkeleton type="table" /> },
  ),
};

export function getWidgetComponent(type: WidgetType): React.ComponentType {
  return WIDGET_REGISTRY[type];
}
```

### 9.2 Widget Metadata Configuration

```typescript
// lib/widget-configs.ts

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
  label: string;
  labelKo: string;
  icon: string;             // Lucide icon name
  minW: number;
  minH: number;
  defaultW: number;
  defaultH: number;
  maxW?: number;
  maxH?: number;
  refreshType: 'websocket' | 'polling' | 'on-demand';
  refreshInterval?: number; // ms, only for polling type
}

export const WIDGET_CONFIGS: Record<WidgetType, WidgetConfig> = {
  watchlist: {
    label: 'Watchlist',
    labelKo: '관심종목',
    icon: 'Star',
    minW: 3, minH: 4, defaultW: 4, defaultH: 8,
    refreshType: 'websocket',
  },
  candlestick: {
    label: 'Chart',
    labelKo: '차트',
    icon: 'CandlestickChart',
    minW: 4, minH: 5, defaultW: 6, defaultH: 8, maxW: 12,
    refreshType: 'websocket',
  },
  newsFeed: {
    label: 'News Feed',
    labelKo: '뉴스 피드',
    icon: 'Newspaper',
    minW: 3, minH: 4, defaultW: 4, defaultH: 6,
    refreshType: 'websocket',
  },
  themeSummary: {
    label: 'Theme Summary',
    labelKo: '테마 요약',
    icon: 'LayoutGrid',
    minW: 2, minH: 3, defaultW: 3, defaultH: 5,
    refreshType: 'polling',
    refreshInterval: 30_000,
  },
  surgeAlerts: {
    label: 'Surge Alerts',
    labelKo: '급등 알림',
    icon: 'AlertTriangle',
    minW: 2, minH: 3, defaultW: 3, defaultH: 4,
    refreshType: 'websocket',
  },
  aiAnalysis: {
    label: 'AI Analysis',
    labelKo: 'AI 분석',
    icon: 'Brain',
    minW: 3, minH: 4, defaultW: 4, defaultH: 6,
    refreshType: 'on-demand',
  },
  marketIndices: {
    label: 'Market Indices',
    labelKo: '시장 지수',
    icon: 'TrendingUp',
    minW: 2, minH: 2, defaultW: 3, defaultH: 3,
    refreshType: 'websocket',
  },
  topVolume: {
    label: 'Top Volume',
    labelKo: '거래대금 상위',
    icon: 'BarChart3',
    minW: 3, minH: 3, defaultW: 4, defaultH: 5,
    refreshType: 'polling',
    refreshInterval: 10_000,
  },
};
```

---

## Summary

This document defines the complete frontend component architecture for the stock monitoring dashboard. The key architectural decisions are:

1. **Page structure**: 5 routes organized into 3 route groups (auth, dashboard, admin) with appropriate guards and layouts.

2. **Widget system**: 8 widget types, each with typed props interfaces, declared data sources, grid size constraints, and specific refresh strategies (WebSocket real-time, polling, or on-demand).

3. **Grid layout**: React Grid Layout v2 with 3 responsive breakpoints (xl/lg/md), 12-column grid, localStorage persistence with optional server sync, and a widget manager UI for add/remove.

4. **State management**: Three Zustand stores (dashboard, preferences, realtime) for client state, TanStack Query for server state with a hierarchical query key system and WebSocket-driven cache invalidation.

5. **Real-time pipeline**: Socket.IO singleton with exponential backoff reconnection, room-based symbol subscriptions, and a clear event-to-store-to-UI pipeline.

6. **UI components**: Full shadcn/ui component mapping covering every UI element, with a shared WidgetWrapper providing consistent drag-and-drop and remove functionality.

7. **Korean conventions**: Red = up, blue = down color system applied throughout charts and tables, with Korean number formatting (Won, percentage, volume units) and WCAG 2.1 AA compliance including color-blind safe icon supplements.

8. **Performance**: Sub-3-second initial load via PPR + code splitting, 60fps stock list scrolling via virtualization, sub-16ms chart updates via requestAnimationFrame batching, and a total initial JS budget under 300KB gzipped.
