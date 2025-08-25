/**
 * Rate Limiter
 *
 * Sliding window rate limiting for API endpoints.
 */

import {
  incrementCounter,
  METRICS,
  setGauge,
} from '../observability/metrics.js';
import type { LogContext } from '../observability/structured-logger.js';
import { logger } from '../observability/structured-logger.js';

export interface RateLimitRule {
  id: string;
  name: string;
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (context: any) => string;
  skipIf?: (context: any) => boolean;
  message?: string;
}

export interface RateLimitResult {
  allowed: boolean;
  resetTime: number;
  remaining: number;
  total: number;
  retryAfter?: number;
}

export interface RateLimitWindow {
  count: number;
  resetTime: number;
  requests: number[]; // Timestamps of requests in current window
}

export class RateLimiter {
  private windows = new Map<string, RateLimitWindow>();
  private rules = new Map<string, RateLimitRule>();
  private cleanupTimer?: NodeJS.Timeout;

  constructor() {
    this.initializeDefaultRules();
    this.startCleanup();
  }

  /**
   * Add or update a rate limit rule
   */
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.id, rule);

    logger.info('Rate limit rule added', {
      ruleId: rule.id,
      name: rule.name,
      windowMs: rule.windowMs,
      maxRequests: rule.maxRequests,
    });
  }

  /**
   * Remove a rate limit rule
   */
  removeRule(ruleId: string): boolean {
    return this.rules.delete(ruleId);
  }

  /**
   * Check if request should be rate limited
   */
  checkLimit(
    ruleId: string,
    context: any = {},
    logContext: LogContext = {},
  ): RateLimitResult {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      throw new Error(`Rate limit rule ${ruleId} not found`);
    }

    // Check if request should be skipped
    if (rule.skipIf?.(context)) {
      return {
        allowed: true,
        resetTime: Date.now() + rule.windowMs,
        remaining: rule.maxRequests,
        total: rule.maxRequests,
      };
    }

    // Generate key for this request
    const key = rule.keyGenerator ? rule.keyGenerator(context) : 'default';
    const windowKey = `${ruleId}:${key}`;

    // Get or create window
    const now = Date.now();
    let window = this.windows.get(windowKey);

    if (!window) {
      window = {
        count: 0,
        resetTime: now + rule.windowMs,
        requests: [],
      };
      this.windows.set(windowKey, window);
    }

    // Reset window if expired
    if (now >= window.resetTime) {
      window = {
        count: 0,
        resetTime: now + rule.windowMs,
        requests: [],
      };
      this.windows.set(windowKey, window);
    }

    // Clean up old requests from sliding window
    window.requests = window.requests.filter(
      (timestamp) => timestamp > now - rule.windowMs,
    );
    window.count = window.requests.length;

    const allowed = window.count < rule.maxRequests;
    const remaining = Math.max(0, rule.maxRequests - window.count);

    if (allowed) {
      // Add this request to the window
      window.requests.push(now);
      window.count++;
    }

    const result: RateLimitResult = {
      allowed,
      resetTime: window.resetTime,
      remaining: allowed ? remaining - 1 : remaining,
      total: rule.maxRequests,
      retryAfter: allowed
        ? undefined
        : Math.ceil((window.resetTime - now) / 1000),
    };

    // Log rate limit decision
    this.logRateLimit(rule, key, result, logContext);

    // Update metrics
    incrementCounter(METRICS.REQUESTS_TOTAL, 1, {
      status: allowed ? 'allowed' : 'rate_limited',
      rule: rule.id,
    });

    setGauge('hatago_rate_limit_remaining', remaining, {
      rule: rule.id,
      key: key,
    });

    return result;
  }

  /**
   * Get current usage for a rule and key
   */
  getCurrentUsage(
    ruleId: string,
    key: string = 'default',
  ): {
    count: number;
    remaining: number;
    resetTime: number;
  } | null {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      return null;
    }

    const windowKey = `${ruleId}:${key}`;
    const window = this.windows.get(windowKey);

    if (!window) {
      return {
        count: 0,
        remaining: rule.maxRequests,
        resetTime: Date.now() + rule.windowMs,
      };
    }

    const now = Date.now();

    // Clean up expired requests
    window.requests = window.requests.filter(
      (timestamp) => timestamp > now - rule.windowMs,
    );
    window.count = window.requests.length;

    return {
      count: window.count,
      remaining: Math.max(0, rule.maxRequests - window.count),
      resetTime: window.resetTime,
    };
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(ruleId: string, key: string = 'default'): boolean {
    const windowKey = `${ruleId}:${key}`;
    return this.windows.delete(windowKey);
  }

  /**
   * Get all active windows
   */
  getActiveWindows(): Array<{
    rule: string;
    key: string;
    count: number;
    remaining: number;
    resetTime: number;
  }> {
    const active: Array<{
      rule: string;
      key: string;
      count: number;
      remaining: number;
      resetTime: number;
    }> = [];

    for (const [windowKey, window] of this.windows) {
      const [ruleId, key] = windowKey.split(':', 2);
      const rule = this.rules.get(ruleId);

      if (rule) {
        active.push({
          rule: ruleId,
          key,
          count: window.count,
          remaining: Math.max(0, rule.maxRequests - window.count),
          resetTime: window.resetTime,
        });
      }
    }

    return active;
  }

  /**
   * List all rules
   */
  listRules(): RateLimitRule[] {
    return Array.from(this.rules.values());
  }

  private logRateLimit(
    rule: RateLimitRule,
    key: string,
    result: RateLimitResult,
    logContext: LogContext,
  ): void {
    if (!result.allowed) {
      logger.security({
        event: 'rate_limit',
        reason: 'limit_exceeded',
        rule: rule.id,
        key,
        remaining: result.remaining,
        resetTime: result.resetTime,
        retryAfter: result.retryAfter,
        ...logContext,
      });
    }
  }

  private initializeDefaultRules(): void {
    // General API rate limit
    this.addRule({
      id: 'api-general',
      name: 'General API Rate Limit',
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 100,
      keyGenerator: (context) => context.clientId || context.ip || 'anonymous',
      message: 'Too many requests, please try again later',
    });

    // Tool execution rate limit
    this.addRule({
      id: 'tool-execution',
      name: 'Tool Execution Rate Limit',
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 50,
      keyGenerator: (context) =>
        `${context.clientId || context.ip || 'anonymous'}:${context.serverName || 'default'}`,
      message: 'Too many tool executions, please slow down',
    });

    // Authentication rate limit
    this.addRule({
      id: 'authentication',
      name: 'Authentication Rate Limit',
      windowMs: 15 * 60 * 1000, // 15 minutes
      maxRequests: 10,
      keyGenerator: (context) => context.ip || 'anonymous',
      message: 'Too many authentication attempts, please try again later',
    });

    // Server operations rate limit
    this.addRule({
      id: 'server-operations',
      name: 'Server Operations Rate Limit',
      windowMs: 5 * 60 * 1000, // 5 minutes
      maxRequests: 20,
      keyGenerator: (context) => context.clientId || context.ip || 'anonymous',
      message: 'Too many server operations, please slow down',
    });

    // Streaming connections rate limit
    this.addRule({
      id: 'streaming',
      name: 'Streaming Connections Rate Limit',
      windowMs: 60 * 1000, // 1 minute
      maxRequests: 10,
      keyGenerator: (context) => context.clientId || context.ip || 'anonymous',
      message: 'Too many streaming connections',
    });
  }

  private startCleanup(): void {
    // Clean up expired windows every 5 minutes
    this.cleanupTimer = setInterval(
      () => {
        this.cleanupExpiredWindows();
      },
      5 * 60 * 1000,
    );
  }

  private cleanupExpiredWindows(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [windowKey, window] of this.windows) {
      if (now >= window.resetTime) {
        this.windows.delete(windowKey);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug('Cleaned up expired rate limit windows', { cleaned });
    }
  }

  /**
   * Stop the rate limiter and clean up resources
   */
  stop(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = undefined;
    }
    this.windows.clear();
  }
}

// Global rate limiter instance
export const rateLimiter = new RateLimiter();

// Convenience functions
export function checkRateLimit(
  ruleId: string,
  context?: any,
  logContext?: LogContext,
): RateLimitResult {
  return rateLimiter.checkLimit(ruleId, context, logContext);
}

export function resetRateLimit(ruleId: string, key?: string): boolean {
  return rateLimiter.reset(ruleId, key);
}
