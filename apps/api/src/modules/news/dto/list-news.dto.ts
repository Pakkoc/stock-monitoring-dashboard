import { z } from 'zod';

/**
 * News list query parameters — Zod schema.
 *
 * Matches step-8-schema-api-design.md §5.3 GET /api/news
 * and GET /api/stocks/:symbol/news query params.
 */
export const ListNewsDtoSchema = z.object({
  stockSymbol: z.string().max(20).optional(),
  source: z.string().max(50).optional(),
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  minRelevance: z.coerce.number().min(0).max(1).default(0.5),
});

export type ListNewsDto = z.infer<typeof ListNewsDtoSchema>;
