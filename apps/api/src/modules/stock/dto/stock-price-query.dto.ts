import { z } from 'zod';

/**
 * Stock price history query parameters — Zod schema.
 *
 * Matches step-8-schema-api-design.md §5.3 GET /api/stocks/:symbol/prices
 */
export const StockPriceQueryDtoSchema = z.object({
  interval: z
    .enum(['1m', '5m', '15m', '1h', '1d', '1w', '1M'])
    .default('1d'),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});

export type StockPriceQueryDto = z.infer<typeof StockPriceQueryDtoSchema>;
