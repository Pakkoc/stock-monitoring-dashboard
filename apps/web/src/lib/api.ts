/**
 * REST API client — typed fetch wrapper for the NestJS backend.
 * Falls back to static JSON snapshots when the backend is unreachable.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Cached snapshot data (loaded once on first fallback) */
let snapshotCache: Record<string, unknown> | null = null;
let chartCache: Record<string, unknown> | null = null;

async function loadSnapshot(): Promise<Record<string, unknown>> {
  if (snapshotCache) return snapshotCache;
  try {
    const res = await fetch('/api-snapshot/dashboard.json');
    snapshotCache = await res.json();
    return snapshotCache!;
  } catch { return {}; }
}

async function loadChartSnapshot(): Promise<Record<string, unknown>> {
  if (chartCache) return chartCache;
  try {
    const res = await fetch('/api-snapshot/charts.json');
    chartCache = await res.json();
    return chartCache!;
  } catch { return {}; }
}

/** Map API endpoint to snapshot data */
async function getSnapshotFallback(endpoint: string): Promise<unknown | null> {
  const snapshot = await loadSnapshot();
  const s = snapshot as any;

  // /stocks?...
  if (endpoint.startsWith('/stocks') && !endpoint.includes('/prices') && !endpoint.includes('/market') && !endpoint.includes('/surge') && !endpoint.includes('/news')) {
    return s?.stocks;
  }
  // /stocks/market/indices
  if (endpoint.includes('/market/indices')) {
    return s?.indices;
  }
  // /themes/performance
  if (endpoint.includes('/themes/performance')) {
    return s?.themes;
  }
  // /news
  if (endpoint.startsWith('/news')) {
    return s?.news;
  }
  // /stocks/:symbol/prices
  const priceMatch = endpoint.match(/\/stocks\/(\d+)\/prices/);
  if (priceMatch) {
    const charts = await loadChartSnapshot();
    const symbolData = (charts as any)[priceMatch[1]];
    if (symbolData) return symbolData;
  }
  // /stocks/:symbol (detail)
  const detailMatch = endpoint.match(/\/stocks\/(\d+)$/);
  if (detailMatch && s?.stocks?.data) {
    const stock = s.stocks.data.find((st: any) => st.symbol === detailMatch[1]);
    if (stock) return { data: stock };
  }

  return null;
}

/** Standard API error response */
export interface ApiError {
  statusCode: number;
  error: string;
  message: string;
  timestamp: string;
  path: string;
}

/** API response wrapper */
export interface ApiResponse<T> {
  data: T;
  meta?: {
    total: number;
    page: number;
    limit: number;
  };
}

/**
 * Retrieve the auth token from localStorage (Zustand persist store).
 * Returns null if no token is found or if running on the server.
 */
function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    // Zustand persist stores data under the key 'smd-auth'
    const raw = localStorage.getItem('smd-auth');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Zustand persist wraps the partialised state in { state: { ... } }
    return parsed?.state?.token ?? null;
  } catch {
    return null;
  }
}

/**
 * Generic fetch wrapper with error handling.
 */
async function apiFetch<T>(
  endpoint: string,
  options?: RequestInit,
): Promise<T> {
  const url = `${API_BASE_URL}/api${endpoint}`;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options?.headers as Record<string, string>),
  };

  // Attach auth token if available
  const token = getAuthToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include',
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        statusCode: response.status,
        error: response.statusText,
        message: 'An error occurred',
        timestamp: new Date().toISOString(),
        path: endpoint,
      }));
      throw error;
    }

    return response.json() as Promise<T>;
  } catch (err) {
    // Fallback to static snapshot when backend is unreachable
    if (options?.method === 'GET' || !options?.method) {
      const fallback = await getSnapshotFallback(endpoint);
      if (fallback) return fallback as T;
    }
    throw err;
  }
}

/** GET request */
export function apiGet<T>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: 'GET' });
}

/** POST request */
export function apiPost<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** PUT request */
export function apiPut<T>(endpoint: string, body?: unknown): Promise<T> {
  return apiFetch<T>(endpoint, {
    method: 'PUT',
    body: body ? JSON.stringify(body) : undefined,
  });
}

/** DELETE request */
export function apiDelete<T>(endpoint: string): Promise<T> {
  return apiFetch<T>(endpoint, { method: 'DELETE' });
}
