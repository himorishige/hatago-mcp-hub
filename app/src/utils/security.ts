/**
 * Security utilities for masking sensitive information
 */

import {
  createGuard,
  type GuardResult,
  ruleBuilder,
  securityPatterns,
} from '@himorishige/noren';

/**
 * Custom rules for Hatago-specific sensitive data
 */
const customRules = ruleBuilder()
  // Authentication headers
  .addReplacement(/Bearer\s+[\w\-.]+/gi, 'Bearer [REDACTED]')
  .addReplacement(/Basic\s+[\w\-+=]+/gi, 'Basic [REDACTED]')
  // JSON tokens and keys
  .addReplacement(/"token"\s*:\s*"[^"]*"/gi, '"token": "[REDACTED]"')
  .addReplacement(/"apiKey"\s*:\s*"[^"]*"/gi, '"apiKey": "[REDACTED]"')
  .addReplacement(/"api_key"\s*:\s*"[^"]*"/gi, '"api_key": "[REDACTED]"')
  .addReplacement(/"password"\s*:\s*"[^"]*"/gi, '"password": "[REDACTED]"')
  .addReplacement(/"secret"\s*:\s*"[^"]*"/gi, '"secret": "[REDACTED]"')
  // URL query parameters
  .addReplacement(/(\?|&)token=[\w\-.]+/gi, '$1token=[REDACTED]')
  .addReplacement(/(\?|&)api_key=[\w\-.]+/gi, '$1api_key=[REDACTED]')
  // Environment variables
  .addReplacement(/HATAGO_API_TOKEN=[\w\-.]+/gi, 'HATAGO_API_TOKEN=[REDACTED]')
  .build();

/**
 * Security guard instance for Hatago
 */
export const securityGuard = createGuard({
  customPatterns: securityPatterns,
  customRules,
  riskThreshold: 50,
  detectPII: true,
  detectSecrets: true,
});

/**
 * Sanitize a log message to remove sensitive information
 */
export async function sanitizeLog(message: string): Promise<string> {
  try {
    const result = await securityGuard.check(message);
    return result.sanitizedContent;
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
  const result = await securityGuard.check(content);
  return result.riskScore > 0;
}

/**
 * Get risk assessment for content
 */
export async function assessRisk(content: string): Promise<GuardResult> {
  return await securityGuard.check(content);
}
