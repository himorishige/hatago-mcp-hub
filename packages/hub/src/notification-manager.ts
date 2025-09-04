/**
 * Notification Manager for MCP Hub
 *
 * Provides a simple notification system with rate limiting
 * for server events and status changes.
 */

import type { Logger } from './logger.js';

export type NotificationSeverity = 'info' | 'warn' | 'error';
export type NotificationCategory = 'config' | 'server' | 'tool';

export type NotificationEvent = {
  severity: NotificationSeverity;
  category: NotificationCategory;
  message: string;
  data?: unknown;
  timestamp: number;
};

export type NotificationConfig = {
  enabled: boolean;
  rateLimitSec: number;
  severity: NotificationSeverity[];
};

/**
 * Simple notification manager with rate limiting
 */
export class NotificationManager {
  private config: NotificationConfig;
  private logger: Logger;
  private lastNotifications = new Map<string, number>();
  private handlers: Array<(event: NotificationEvent) => void> = [];

  constructor(config: NotificationConfig, logger: Logger) {
    this.config = config;
    this.logger = logger;
  }

  /**
   * Register a notification handler
   */
  onNotification(handler: (event: NotificationEvent) => void): void {
    this.handlers.push(handler);
  }

  /**
   * Send a notification if it passes rate limiting and severity checks
   */
  notify(
    severity: NotificationSeverity,
    category: NotificationCategory,
    message: string,
    data?: unknown
  ): void {
    // Check if notifications are enabled
    if (!this.config.enabled) {
      return;
    }

    // Check severity level
    if (!this.config.severity.includes(severity)) {
      return;
    }

    // Create unique key for rate limiting
    const key = `${category}:${message}`;
    const now = Date.now();
    const lastSent = this.lastNotifications.get(key) ?? 0;

    // Check rate limit
    if (now - lastSent < this.config.rateLimitSec * 1000) {
      this.logger.debug('Notification rate limited', {
        category,
        message,
        nextAllowedIn: `${Math.ceil((this.config.rateLimitSec * 1000 - (now - lastSent)) / 1000)}s`
      });
      return;
    }

    // Update last sent time
    this.lastNotifications.set(key, now);

    // Create notification event
    const event: NotificationEvent = {
      severity,
      category,
      message,
      data,
      timestamp: now
    };

    // Log the notification
    const logMethod = severity === 'error' ? 'error' : severity === 'warn' ? 'warn' : 'info';
    this.logger[logMethod](
      `[${category.toUpperCase()}] ${message}`,
      data as Record<string, unknown> | undefined
    );

    // Send to handlers
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (error) {
        this.logger.error('Notification handler error', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
  }

  /**
   * Notify configuration reload
   */
  notifyConfigReload(success: boolean, error?: string): void {
    if (success) {
      this.notify('info', 'config', 'Configuration reloaded successfully');
    } else {
      this.notify('error', 'config', 'Configuration reload failed', { error });
    }
  }

  /**
   * Notify server status change
   */
  notifyServerStatus(
    serverId: string,
    status: 'starting' | 'connected' | 'disconnected' | 'error',
    error?: string
  ): void {
    const severity: NotificationSeverity =
      status === 'error' ? 'error' : status === 'disconnected' ? 'warn' : 'info';
    const message = `Server ${serverId} ${status}`;
    this.notify(severity, 'server', message, error ? { error } : undefined);
  }

  /**
   * Notify timeout occurred
   */
  notifyTimeout(serverId: string, operation: string, timeoutMs: number): void {
    this.notify('warn', 'server', `Timeout on ${operation} for server ${serverId}`, { timeoutMs });
  }

  /**
   * Clear rate limit cache (useful for testing)
   */
  clearRateLimits(): void {
    this.lastNotifications.clear();
  }
}
