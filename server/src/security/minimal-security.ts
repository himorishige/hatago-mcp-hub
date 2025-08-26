/**
 * Minimal security features for Hatago
 *
 * Provides basic protection without heavy dependencies:
 * - Local-only binding by default
 * - Shared secret for remote access
 * - Basic input validation
 * - Secret masking in logs
 */

import { createHash } from 'node:crypto';
import type { Context } from 'hono';

export interface MinimalSecurityConfig {
  /** Bind address (default: 127.0.0.1) */
  bindAddress?: string;
  /** Allow remote connections */
  allowRemote?: boolean;
  /** Shared secret for authentication */
  sharedSecret?: string;
  /** Request timeout in ms */
  requestTimeout?: number;
  /** Max request size in bytes */
  maxRequestSize?: number;
}

/**
 * Default security configuration
 */
export const DEFAULT_SECURITY_CONFIG: Required<MinimalSecurityConfig> = {
  bindAddress: '127.0.0.1',
  allowRemote: false,
  sharedSecret: '',
  requestTimeout: 30000, // 30 seconds
  maxRequestSize: 2 * 1024 * 1024, // 2MB
};

/**
 * Validate bind address for security
 */
export function validateBindAddress(
  address: string,
  allowRemote: boolean,
): void {
  if (!allowRemote && address !== '127.0.0.1' && address !== 'localhost') {
    throw new Error(
      'Remote binding requires --allow-remote flag. Use --allow-remote to enable.',
    );
  }
}

/**
 * Check shared secret authentication
 */
export function checkSharedSecret(ctx: Context, sharedSecret: string): boolean {
  if (!sharedSecret) {
    return true; // No secret configured
  }

  const authHeader = ctx.req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }

  const token = authHeader.slice(7);
  return token === sharedSecret;
}

/**
 * Hash a secret for comparison (basic protection)
 */
export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

/**
 * Mask sensitive values in logs
 */
export function maskSensitiveData(data: any): any {
  if (typeof data === 'string') {
    // Mask common patterns
    return data
      .replace(/Bearer\s+[^\s]+/gi, 'Bearer ***')
      .replace(/"(password|token|secret|api_key)":\s*"[^"]+"/gi, '"$1":"***"')
      .replace(/\b[A-Za-z0-9]{32,}\b/g, '***'); // Long tokens
  }

  if (typeof data === 'object' && data !== null) {
    const masked: any = Array.isArray(data) ? [] : {};
    for (const key in data) {
      if (
        key.toLowerCase().includes('secret') ||
        key.toLowerCase().includes('token') ||
        key.toLowerCase().includes('password') ||
        key.toLowerCase().includes('api_key')
      ) {
        masked[key] = '***';
      } else {
        masked[key] = maskSensitiveData(data[key]);
      }
    }
    return masked;
  }

  return data;
}

/**
 * Basic rate limiting (in-memory)
 */
export class SimpleRateLimiter {
  private requests = new Map<string, number[]>();
  private readonly windowMs: number;
  private readonly maxRequests: number;

  constructor(windowMs = 60000, maxRequests = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  check(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Clean old requests
    const validRequests = requests.filter((time) => now - time < this.windowMs);

    if (validRequests.length >= this.maxRequests) {
      return false;
    }

    validRequests.push(now);
    this.requests.set(key, validRequests);

    // Cleanup old keys periodically
    if (Math.random() < 0.01) {
      this.cleanup();
    }

    return true;
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, requests] of this.requests.entries()) {
      const validRequests = requests.filter(
        (time) => now - time < this.windowMs,
      );
      if (validRequests.length === 0) {
        this.requests.delete(key);
      } else {
        this.requests.set(key, validRequests);
      }
    }
  }
}

/**
 * Get client identifier for rate limiting
 */
export function getClientId(ctx: Context): string {
  return (
    ctx.req.header('X-Forwarded-For') ||
    ctx.req.header('X-Real-IP') ||
    ctx.env?.remoteAddr ||
    'unknown'
  );
}

/**
 * Security middleware for Hono
 */
export function createSecurityMiddleware(config: MinimalSecurityConfig = {}) {
  const cfg = { ...DEFAULT_SECURITY_CONFIG, ...config };
  const rateLimiter = new SimpleRateLimiter();

  return async (ctx: Context, next: () => Promise<void>) => {
    // Check shared secret
    if (cfg.sharedSecret && !checkSharedSecret(ctx, cfg.sharedSecret)) {
      return ctx.json({ error: 'Unauthorized' }, 401);
    }

    // Basic rate limiting
    const clientId = getClientId(ctx);
    if (!rateLimiter.check(clientId)) {
      return ctx.json({ error: 'Too many requests' }, 429);
    }

    // Request size check
    const contentLength = ctx.req.header('Content-Length');
    if (contentLength && Number(contentLength) > cfg.maxRequestSize) {
      return ctx.json({ error: 'Request too large' }, 413);
    }

    // Add timeout
    const timeoutId = setTimeout(() => {
      ctx.json({ error: 'Request timeout' }, 408);
    }, cfg.requestTimeout);

    try {
      await next();
    } finally {
      clearTimeout(timeoutId);
    }
  };
}
