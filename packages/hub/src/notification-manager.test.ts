import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NotificationManager } from './notification-manager.js';
import type { NotificationConfig, NotificationEvent } from './notification-manager.js';
import type { Logger } from './logger.js';

describe('NotificationManager', () => {
  let mockLogger: Logger;
  let manager: NotificationManager;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as Logger;
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  describe('Initialization', () => {
    it('should initialize with default config', () => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60,
          severity: ['warn', 'error']
        },
        mockLogger
      );

      expect(manager).toBeDefined();
    });

    it('should handle disabled notifications', () => {
      manager = new NotificationManager(
        {
          enabled: false,
          rateLimitSec: 60,
          severity: ['warn', 'error']
        },
        mockLogger
      );

      manager.notify('info', 'server', 'Test message');

      // Should not log when disabled
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('Severity filtering', () => {
    beforeEach(() => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60,
          severity: ['warn', 'error'] // Only warn and error
        },
        mockLogger
      );
    });

    it('should notify for configured severity levels', () => {
      manager.notify('warn', 'server', 'Warning message');
      expect(mockLogger.warn).toHaveBeenCalledWith('[SERVER] Warning message', undefined);

      manager.notify('error', 'tool', 'Error message');
      expect(mockLogger.error).toHaveBeenCalledWith('[TOOL] Error message', undefined);
    });

    it('should ignore non-configured severity levels', () => {
      manager.notify('info', 'server', 'Info message');
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('Rate limiting', () => {
    beforeEach(() => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60, // 1 minute rate limit
          severity: ['info', 'warn', 'error']
        },
        mockLogger
      );
    });

    it('should rate limit duplicate messages', () => {
      const message = 'Rate limited message';

      // First message should go through
      manager.notify('info', 'server', message);
      expect(mockLogger.info).toHaveBeenCalledTimes(1);

      // Second identical message within rate limit should be blocked
      manager.notify('info', 'server', message);
      expect(mockLogger.info).toHaveBeenCalledTimes(1);

      // After rate limit expires, message should go through again
      vi.advanceTimersByTime(61000); // 61 seconds
      manager.notify('info', 'server', message);
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });

    it('should allow different messages within rate limit', () => {
      manager.notify('info', 'server', 'Message 1');
      manager.notify('info', 'server', 'Message 2');
      manager.notify('info', 'server', 'Message 3');

      expect(mockLogger.info).toHaveBeenCalledTimes(3);
    });

    it('should rate limit per message and category', () => {
      const message = 'Same message';

      // Send same message with different categories
      manager.notify('info', 'server', message);
      manager.notify('info', 'tool', message); // Different category
      expect(mockLogger.info).toHaveBeenCalledTimes(2);

      // Send same message with same category (should be blocked)
      manager.notify('info', 'server', message);
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });
  });

  describe('Server status notifications', () => {
    beforeEach(() => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60,
          severity: ['info', 'warn', 'error']
        },
        mockLogger
      );
    });

    it('should notify server starting', () => {
      manager.notifyServerStatus('test-server', 'starting');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SERVER] Server test-server starting',
        undefined
      );
    });

    it('should notify server connected', () => {
      manager.notifyServerStatus('test-server', 'connected');
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[SERVER] Server test-server connected',
        undefined
      );
    });

    it('should notify server disconnected', () => {
      manager.notifyServerStatus('test-server', 'disconnected');
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[SERVER] Server test-server disconnected',
        undefined
      );
    });

    it('should notify server error', () => {
      manager.notifyServerStatus('test-server', 'error', 'Connection timeout');
      expect(mockLogger.error).toHaveBeenCalledWith('[SERVER] Server test-server error', {
        error: 'Connection timeout'
      });
    });
  });

  describe('Configuration reload notifications', () => {
    beforeEach(() => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60,
          severity: ['info', 'error']
        },
        mockLogger
      );
    });

    it('should notify successful config reload', () => {
      manager.notifyConfigReload(true);
      expect(mockLogger.info).toHaveBeenCalledWith(
        '[CONFIG] Configuration reloaded successfully',
        undefined
      );
    });

    it('should notify failed config reload', () => {
      manager.notifyConfigReload(false, 'Invalid JSON');
      expect(mockLogger.error).toHaveBeenCalledWith('[CONFIG] Configuration reload failed', {
        error: 'Invalid JSON'
      });
    });
  });

  describe('Notification handlers', () => {
    beforeEach(() => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60,
          severity: ['info', 'warn', 'error']
        },
        mockLogger
      );
    });

    it('should call registered handlers', () => {
      const handler = vi.fn();
      manager.onNotification(handler);

      manager.notify('info', 'server', 'Test message', { extra: 'data' });

      expect(handler).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: 'info',
          category: 'server',
          message: 'Test message',
          data: { extra: 'data' },
          timestamp: expect.any(Number)
        })
      );
    });

    it('should handle handler errors gracefully', () => {
      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const normalHandler = vi.fn();

      manager.onNotification(errorHandler);
      manager.onNotification(normalHandler);

      manager.notify('info', 'server', 'Test message');

      // Both handlers should be called despite error
      expect(errorHandler).toHaveBeenCalled();
      expect(normalHandler).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalledWith('Notification handler error', {
        error: 'Handler error'
      });
    });
  });

  describe('Timeout notifications', () => {
    beforeEach(() => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60,
          severity: ['warn']
        },
        mockLogger
      );
    });

    it('should notify timeout', () => {
      manager.notifyTimeout('test-server', 'initialization', 5000);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[SERVER] Timeout on initialization for server test-server',
        { timeoutMs: 5000 }
      );
    });
  });

  describe('Clear rate limits', () => {
    beforeEach(() => {
      manager = new NotificationManager(
        {
          enabled: true,
          rateLimitSec: 60,
          severity: ['info']
        },
        mockLogger
      );
    });

    it('should clear rate limit cache', () => {
      const message = 'Test message';

      // Send message
      manager.notify('info', 'server', message);
      expect(mockLogger.info).toHaveBeenCalledTimes(1);

      // Should be rate limited
      manager.notify('info', 'server', message);
      expect(mockLogger.info).toHaveBeenCalledTimes(1);

      // Clear rate limits
      manager.clearRateLimits();

      // Should be able to send again
      manager.notify('info', 'server', message);
      expect(mockLogger.info).toHaveBeenCalledTimes(2);
    });
  });
});
