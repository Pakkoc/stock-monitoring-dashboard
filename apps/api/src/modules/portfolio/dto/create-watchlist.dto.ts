import { z } from 'zod';

/**
 * Create watchlist DTO — Zod schema.
 */
export const CreateWatchlistDtoSchema = z.object({
  name: z
    .string()
    .min(1, 'Watchlist name is required')
    .max(100, 'Watchlist name must be at most 100 characters'),
});

export type CreateWatchlistDto = z.infer<typeof CreateWatchlistDtoSchema>;

/**
 * Update watchlist DTO — Zod schema.
 */
export const UpdateWatchlistDtoSchema = z.object({
  name: z
    .string()
    .min(1, 'Watchlist name is required')
    .max(100, 'Watchlist name must be at most 100 characters'),
});

export type UpdateWatchlistDto = z.infer<typeof UpdateWatchlistDtoSchema>;

/**
 * Add item to watchlist DTO — Zod schema.
 */
export const AddWatchlistItemDtoSchema = z.object({
  stockId: z.number().int().positive('Stock ID must be a positive integer'),
});

export type AddWatchlistItemDto = z.infer<typeof AddWatchlistItemDtoSchema>;
