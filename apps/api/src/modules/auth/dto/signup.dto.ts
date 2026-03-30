import { z } from 'zod';

/**
 * Signup request DTO — Zod schema.
 *
 * Validation rules per step-8-schema-api-design.md §5.2:
 * - email: valid email format, max 255 chars
 * - password: min 8 chars, at least 1 uppercase, 1 lowercase, 1 digit, 1 special char
 * - name: min 2 chars, max 100 chars
 */
export const SignupDtoSchema = z.object({
  email: z
    .string()
    .email('Invalid email format')
    .max(255, 'Email must be at most 255 characters'),
  password: z
    .string()
    .min(4, 'Password must be at least 4 characters'),
  name: z
    .string()
    .min(2, 'Name must be at least 2 characters')
    .max(100, 'Name must be at most 100 characters'),
});

export type SignupDto = z.infer<typeof SignupDtoSchema>;
