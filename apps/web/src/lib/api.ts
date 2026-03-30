/**
 * REST API client — typed fetch wrapper for the NestJS backend.
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

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

  const response = await fetch(url, {
    ...options,
    headers,
    credentials: 'include',
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
