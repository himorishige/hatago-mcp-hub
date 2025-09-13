/**
 * Log a message at most once per process for a given key. [SF][REH]
 */
import { Logger } from '../logger.js';

const seen = new Set<string>();

export type OnceLoggerOptions = {
  logger?: Logger;
};

export function warnOnce(
  key: string,
  message: string,
  data?: Record<string, unknown>,
  options?: OnceLoggerOptions
): void {
  if (seen.has(key)) return;
  seen.add(key);

  const l = options?.logger ?? new Logger('[Hub][Legacy]');
  l.warn(message, { key, ...(data ?? {}) });
}

export function resetOnceLoggerForTests(): void {
  // For tests only – not exported from package entry. [TDT]
  seen.clear();
}
