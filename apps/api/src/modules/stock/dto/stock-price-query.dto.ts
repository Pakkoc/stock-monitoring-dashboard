import { z } from 'zod';

const intervalEnum = z.enum(['1m', '5m', '15m', '1h', '1d', '1w', '1M']);

/**
 * Stock price history query parameters — Zod schema.
 *
 * Matches step-8-schema-api-design.md §5.3 GET /api/stocks/:symbol/prices
 *
 * Accepts both `interval` and `timeframe` query params (frontend sends `timeframe`).
 * `timeframe` takes precedence when both are provided.
 */
export const StockPriceQueryDtoSchema = z
  .object({
    interval: intervalEnum.default('1d'),
    timeframe: intervalEnum.optional(),
    from: z.string().datetime({ offset: true }).optional(),
    to: z.string().datetime({ offset: true }).optional(),
    limit: z.coerce.number().int().min(1).max(1000).default(200),
  })
  .transform((data) => ({
    ...data,
    // Normalize: if frontend sent `timeframe`, copy it to `interval`
    interval: data.timeframe ?? data.interval,
  }));

export type StockPriceQueryDto = z.output<typeof StockPriceQueryDtoSchema>;
