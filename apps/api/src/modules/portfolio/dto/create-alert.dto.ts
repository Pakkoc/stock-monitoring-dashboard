import { z } from 'zod';

/**
 * Create alert DTO — Zod schema.
 *
 * Validation rules per step-8-schema-api-design.md §5.6:
 * - conditionType: one of PRICE_ABOVE, PRICE_BELOW, CHANGE_RATE, VOLUME_SURGE
 * - threshold: positive number
 */
export const CreateAlertDtoSchema = z.object({
  stockId: z.number().int().positive('Stock ID must be a positive integer'),
  conditionType: z.enum(['PRICE_ABOVE', 'PRICE_BELOW', 'CHANGE_RATE', 'VOLUME_SURGE']),
  threshold: z.number().positive('Threshold must be a positive number'),
});

export type CreateAlertDto = z.infer<typeof CreateAlertDtoSchema>;

/**
 * Update alert DTO — Zod schema.
 * Supports partial update of threshold and/or active status.
 */
export const UpdateAlertDtoSchema = z.object({
  threshold: z.number().positive('Threshold must be a positive number').optional(),
  isActive: z.boolean().optional(),
});

export type UpdateAlertDto = z.infer<typeof UpdateAlertDtoSchema>;

/**
 * Alert list query parameters — Zod schema.
 */
export const ListAlertsDtoSchema = z.object({
  isActive: z
    .enum(['true', 'false'])
    .transform((v) => v === 'true')
    .optional(),
  stockId: z.coerce.number().int().positive().optional(),
});

export type ListAlertsDto = z.infer<typeof ListAlertsDtoSchema>;
