/**
 * Input/output sanitization utilities for the analyzer node.
 *
 * Prevents prompt injection on input and cleans LLM output artifacts.
 */

/**
 * Sanitize user-controlled input before embedding in prompts.
 *
 * - Strips potentially dangerous prompt-injection patterns
 * - Normalizes whitespace
 * - Truncates excessively long strings
 */
export function sanitizeInput(text: string, maxLength = 10_000): string {
  let sanitized = text;

  // Remove potential prompt injection delimiters
  sanitized = sanitized.replace(/```/g, '');
  sanitized = sanitized.replace(/<\/?system>/gi, '');
  sanitized = sanitized.replace(/<\/?human>/gi, '');
  sanitized = sanitized.replace(/<\/?assistant>/gi, '');

  // Normalize whitespace
  sanitized = sanitized.replace(/\r\n/g, '\n');
  sanitized = sanitized.replace(/\t/g, '  ');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength) + '\n... (truncated)';
  }

  return sanitized;
}

/**
 * Sanitize LLM structured output before passing to Quality Gate.
 *
 * Cleans string fields from common LLM artifacts like markdown formatting
 * leaking into structured output.
 */
export function sanitizeOutput<T extends Record<string, unknown>>(obj: T): T {
  const cleaned = { ...obj };

  for (const [key, value] of Object.entries(cleaned)) {
    if (typeof value === 'string') {
      // Remove markdown bold/italic that may leak into structured output
      let s = value.replace(/\*\*/g, '').replace(/\*/g, '');
      // Remove leading/trailing whitespace
      s = s.trim();
      (cleaned as Record<string, unknown>)[key] = s;
    } else if (Array.isArray(value)) {
      (cleaned as Record<string, unknown>)[key] = value.map((item) => {
        if (typeof item === 'string') {
          return item.replace(/\*\*/g, '').replace(/\*/g, '').trim();
        }
        if (typeof item === 'object' && item !== null) {
          return sanitizeOutput(item as Record<string, unknown>);
        }
        return item;
      });
    } else if (typeof value === 'object' && value !== null) {
      (cleaned as Record<string, unknown>)[key] = sanitizeOutput(
        value as Record<string, unknown>,
      );
    }
  }

  return cleaned;
}
