/**
 * Global test setup for the backend (NestJS API).
 *
 * Provides mock implementations of core infrastructure services
 * so unit tests can run without a real database or Redis instance.
 */
import { vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock PrismaService
// ---------------------------------------------------------------------------

/**
 * Creates a mock PrismaService with all commonly used methods stubbed.
 * Each test can override specific methods via vi.fn().mockResolvedValue().
 */
export function createMockPrismaService() {
  return {
    // Prisma model proxies
    stock: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    news: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    newsStock: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    watchlist: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
    watchlistItem: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    alert: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    aiAnalysis: {
      findMany: vi.fn().mockResolvedValue([]),
      findFirst: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
      count: vi.fn().mockResolvedValue(0),
    },
    theme: {
      findMany: vi.fn().mockResolvedValue([]),
      findUnique: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockResolvedValue({}),
    },
    themeStock: {
      findMany: vi.fn().mockResolvedValue([]),
      create: vi.fn().mockResolvedValue({}),
    },

    // Raw query support
    $queryRaw: vi.fn().mockResolvedValue([]),
    $queryRawUnsafe: vi.fn().mockResolvedValue([]),
    $executeRaw: vi.fn().mockResolvedValue(0),
    $executeRawUnsafe: vi.fn().mockResolvedValue(0),

    // Transaction
    $transaction: vi.fn((fn: (prisma: unknown) => Promise<unknown>) => fn({})),

    // Lifecycle
    $connect: vi.fn().mockResolvedValue(undefined),
    $disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

// ---------------------------------------------------------------------------
// Mock RedisService
// ---------------------------------------------------------------------------

/**
 * Creates a mock RedisService with all commonly used methods stubbed.
 */
export function createMockRedisService() {
  const store = new Map<string, string>();

  return {
    get: vi.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: vi.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    del: vi.fn((key: string) => {
      const existed = store.has(key) ? 1 : 0;
      store.delete(key);
      return Promise.resolve(existed);
    }),
    getJson: vi.fn((key: string) => {
      const raw = store.get(key);
      if (!raw) return Promise.resolve(null);
      try {
        return Promise.resolve(JSON.parse(raw));
      } catch {
        return Promise.resolve(null);
      }
    }),
    setJson: vi.fn((key: string, value: unknown) => {
      store.set(key, JSON.stringify(value));
      return Promise.resolve();
    }),
    ping: vi.fn().mockResolvedValue('PONG'),
    getClient: vi.fn().mockReturnValue({
      duplicate: vi.fn(),
      subscribe: vi.fn(),
      on: vi.fn(),
    }),

    // Helper for tests to clear the in-memory store
    _clear: () => store.clear(),
  };
}

// ---------------------------------------------------------------------------
// Mock ConfigService
// ---------------------------------------------------------------------------

export function createMockConfigService(
  overrides: Record<string, string | number | boolean> = {},
) {
  const defaults: Record<string, string | number | boolean> = {
    JWT_SECRET: 'test-jwt-secret-for-unit-tests',
    JWT_EXPIRY_HOURS: 24,
    REDIS_URL: 'redis://localhost:6379',
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test',
    KIS_APP_KEY: 'test-app-key',
    KIS_APP_SECRET: 'test-app-secret',
    NODE_ENV: 'test',
    ...overrides,
  };

  return {
    get: vi.fn(<T>(key: string, defaultValue?: T) => {
      return (defaults[key] as T) ?? defaultValue;
    }),
    getOrThrow: vi.fn((key: string) => {
      if (key in defaults) return defaults[key];
      throw new Error(`Configuration key "${key}" not found`);
    }),
  };
}
