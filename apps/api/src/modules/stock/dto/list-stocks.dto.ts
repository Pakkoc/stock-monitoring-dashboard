import { z } from 'zod';

/**
 * Stock list query parameters — Zod schema.
 *
 * Matches step-8-schema-api-design.md §5.3 GET /api/stocks query params.
 */
export const ListStocksDtoSchema = z.object({
  market: z.enum(['KOSPI', 'KOSDAQ']).optional(),
  sector: z.string().max(50).optional(),
  search: z.string().max(100).optional(),
  sortBy: z
    .enum(['tradeValue', 'changeRate', 'volume', 'name', 'symbol'])
    .default('tradeValue'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  themeId: z.coerce.number().int().positive().optional(),
  watchlistId: z.coerce.number().int().positive().optional(),
});

export type ListStocksDto = z.infer<typeof ListStocksDtoSchema>;
