/**
 * DTO for the POST /api/ai/analyze/:symbol endpoint.
 */

import { IsOptional, IsString, Matches } from 'class-validator';

export class AnalyzeRequestDto {
  /**
   * Stock symbol (6-digit code, e.g., "005930").
   * Extracted from the URL path parameter.
   */
  @IsString()
  @Matches(/^[0-9]{6}$/, {
    message: 'symbol must be a 6-digit stock code (e.g., "005930")',
  })
  symbol!: string;

  /**
   * Optional: preferred LLM model to use for analysis.
   * Defaults to claude-sonnet-4-20250514.
   */
  @IsOptional()
  @IsString()
  model?: string;
}
