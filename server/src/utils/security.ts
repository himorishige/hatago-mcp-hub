/**
 * Security utilities for masking sensitive information
 */

import { detectThreats, isContentSafe } from '@himorishige/noren';

/**
 * Custom sanitization rules for Hatago
 */
const customSanitizations: [RegExp, string][] = [
  // Authentication headers
  [/Bearer\s+[\w\-.]+/gi, 'Bearer [REDACTED]'],
  [/Basic\s+[\w\-+=]+/gi, 'Basic [REDACTED]'],
  // JSON tokens and keys
  [/"token"\s*:\s*"[^"]*"/gi, '"token": "[REDACTED]"'],
  [/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey": "[REDACTED]"'],
  [/"api_key"\s*:\s*"[^"]*"/gi, '"api_key": "[REDACTED]"'],
  [/"password"\s*:\s*"[^"]*"/gi, '"password": "[REDACTED]"'],
  [/"secret"\s*:\s*"[^"]*"/gi, '"secret": "[REDACTED]"'],
  // URL query parameters
  [/(\?|&)token=[\w\-.]+/gi, '$1token=[REDACTED]'],
  [/(\?|&)api_key=[\w\-.]+/gi, '$1api_key=[REDACTED]'],
  // Environment variables
  [/HATAGO_API_TOKEN=[\w\-.]+/gi, 'HATAGO_API_TOKEN=[REDACTED]'],
];

/**
 * Apply custom sanitization rules
 */
function applyCustomSanitization(content: string): string {
  let result = content;
  for (const [pattern, replacement] of customSanitizations) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Sanitize a log message to remove sensitive information
 */
export async function sanitizeLog(message: string): Promise<string> {
  try {
    // Apply our custom sanitization rules directly
    const sanitized = applyCustomSanitization(message);

    // Check if content is safe using noren
    const safe = await isContentSafe(sanitized);
    if (!safe) {
      // If not safe, apply more aggressive redaction
      const id = Math.random().toString(36).substring(7);
      return `[REDACTED-UNSAFE id=${id}]`;
    }

    return sanitized;
  } catch (error) {
    // Debug mode: show error details (opt-in only)
    if (process.env.HATAGO_DEBUG_REDACTION === '1') {
      console.error('[REDACTION-DEBUG]', error);
    }

    // Always return safe fixed message with tracking ID
    const id = Math.random().toString(36).substring(7);
    return `[REDACTED-ERROR id=${id}]`;
  }
}

/**
 * Sanitize an object by masking sensitive fields
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T,
  sensitiveKeys: string[] = [
    'token',
    'password',
    'apiKey',
    'api_key',
    'secret',
  ],
): T {
  const result = { ...obj };

  for (const key in result) {
    const lowerKey = key.toLowerCase();

    // Check if key is sensitive
    if (
      sensitiveKeys.some((sensitive) =>
        lowerKey.includes(sensitive.toLowerCase()),
      )
    ) {
      result[key] = '[REDACTED]' as T[typeof key];
    } else if (typeof result[key] === 'object' && result[key] !== null) {
      // Recursively sanitize nested objects
      result[key] = sanitizeObject(
        result[key] as Record<string, unknown>,
      ) as T[typeof key];
    }
  }

  return result;
}

/**
 * Check if content contains sensitive information
 */
export async function containsSensitiveInfo(content: string): Promise<boolean> {
  const result = await detectThreats(content);
  return result.risk > 0;
}

/**
 * Get risk assessment for content
 */
export async function assessRisk(
  content: string,
): Promise<{ risk: number; safe: boolean; level: string }> {
  return await detectThreats(content);
}
