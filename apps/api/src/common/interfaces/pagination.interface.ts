/**
 * Common pagination interfaces used across all modules.
 * Matches the API contract defined in step-8-schema-api-design.md §5.9
 */

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: PaginationMeta;
}

export interface SingleResponse<T> {
  data: T;
}

export interface PaginationQuery {
  page?: number;
  limit?: number;
}

/**
 * Build a PaginationMeta from total count and query params.
 */
export function buildPaginationMeta(
  total: number,
  page: number,
  limit: number,
): PaginationMeta {
  const totalPages = Math.ceil(total / limit) || 1;
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}
