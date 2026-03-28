/**
 * Global test setup for the frontend (Next.js Web).
 *
 * Provides:
 * - jsdom environment configuration
 * - Mock for Socket.IO client
 * - Mock for TradingView lightweight-charts
 * - Mock for next/navigation
 * - Mock for IntersectionObserver (not available in jsdom)
 * - Mock for ResizeObserver (required by react-grid-layout)
 */
import { vi, afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

// ---------------------------------------------------------------------------
// Auto-cleanup after each test
// ---------------------------------------------------------------------------
afterEach(() => {
  cleanup();
});

// ---------------------------------------------------------------------------
// Mock: Socket.IO Client
// ---------------------------------------------------------------------------
vi.mock('socket.io-client', () => {
  const mockSocket = {
    on: vi.fn(),
    off: vi.fn(),
    emit: vi.fn(),
    connect: vi.fn(),
    disconnect: vi.fn(),
    connected: true,
    id: 'mock-socket-id',
    io: {
      on: vi.fn(),
      off: vi.fn(),
    },
    removeAllListeners: vi.fn(),
  };

  return {
    io: vi.fn(() => mockSocket),
    default: vi.fn(() => mockSocket),
  };
});

// ---------------------------------------------------------------------------
// Mock: lightweight-charts (TradingView)
// ---------------------------------------------------------------------------
vi.mock('lightweight-charts', () => {
  const mockChart = {
    addCandlestickSeries: vi.fn(() => ({
      setData: vi.fn(),
      update: vi.fn(),
      applyOptions: vi.fn(),
    })),
    addLineSeries: vi.fn(() => ({
      setData: vi.fn(),
      update: vi.fn(),
      applyOptions: vi.fn(),
    })),
    addHistogramSeries: vi.fn(() => ({
      setData: vi.fn(),
      update: vi.fn(),
      applyOptions: vi.fn(),
    })),
    applyOptions: vi.fn(),
    timeScale: vi.fn(() => ({
      fitContent: vi.fn(),
      scrollToPosition: vi.fn(),
      applyOptions: vi.fn(),
    })),
    resize: vi.fn(),
    remove: vi.fn(),
    subscribeCrosshairMove: vi.fn(),
    unsubscribeCrosshairMove: vi.fn(),
  };

  return {
    createChart: vi.fn(() => mockChart),
    ColorType: { Solid: 0, VerticalGradient: 1 },
    CrosshairMode: { Normal: 0, Magnet: 1 },
    LineStyle: { Solid: 0, Dotted: 1, Dashed: 2 },
  };
});

// ---------------------------------------------------------------------------
// Mock: next/navigation
// ---------------------------------------------------------------------------
vi.mock('next/navigation', () => ({
  useRouter: vi.fn(() => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
    prefetch: vi.fn(),
  })),
  usePathname: vi.fn(() => '/'),
  useSearchParams: vi.fn(() => new URLSearchParams()),
  useParams: vi.fn(() => ({})),
}));

// ---------------------------------------------------------------------------
// Mock: IntersectionObserver (not in jsdom)
// ---------------------------------------------------------------------------
class MockIntersectionObserver {
  readonly root: Element | null = null;
  readonly rootMargin: string = '';
  readonly thresholds: ReadonlyArray<number> = [];

  constructor(
    private callback: IntersectionObserverCallback,
    _options?: IntersectionObserverInit,
  ) {}

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
  takeRecords = vi.fn(() => [] as IntersectionObserverEntry[]);
}

vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);

// ---------------------------------------------------------------------------
// Mock: ResizeObserver (required by react-grid-layout, recharts)
// ---------------------------------------------------------------------------
class MockResizeObserver {
  constructor(private callback: ResizeObserverCallback) {}

  observe = vi.fn();
  unobserve = vi.fn();
  disconnect = vi.fn();
}

vi.stubGlobal('ResizeObserver', MockResizeObserver);

// ---------------------------------------------------------------------------
// Mock: matchMedia (required by some responsive components)
// ---------------------------------------------------------------------------
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});
