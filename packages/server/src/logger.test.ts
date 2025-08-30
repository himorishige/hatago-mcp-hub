/**
 * Tests for Logger
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Logger } from './logger.js';

describe('Logger', () => {
  let consoleErrorSpy: any;
  let originalConsoleError: any;

  beforeEach(() => {
    // Mock console.error
    originalConsoleError = console.error;
    consoleErrorSpy = vi.fn();
    console.error = consoleErrorSpy;

    // Mock Date.toISOString for consistent timestamps
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-01T12:00:00Z'));
  });

  afterEach(() => {
    console.error = originalConsoleError;
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  describe('Constructor', () => {
    it('should create logger with default info level', () => {
      const logger = new Logger();
      logger.info('test');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should create logger with specified level', () => {
      const logger = new Logger('debug');
      logger.debug('test');
      expect(consoleErrorSpy).toHaveBeenCalled();
    });

    it('should handle invalid log level', () => {
      const logger = new Logger('invalid');
      logger.info('test'); // Should default to info
      expect(consoleErrorSpy).toHaveBeenCalled();
    });
  });

  describe('Log Levels', () => {
    it('should log errors at all levels except silent', () => {
      const levels = ['error', 'warn', 'info', 'debug', 'trace'];

      levels.forEach((level) => {
        consoleErrorSpy.mockClear();
        const logger = new Logger(level);
        logger.error('error message');
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          '[2024-01-01T12:00:00.000Z] [ERROR]',
          'error message',
        );
      });

      // Silent should not log
      consoleErrorSpy.mockClear();
      const silentLogger = new Logger('silent');
      silentLogger.error('error message');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should respect log level hierarchy', () => {
      const logger = new Logger('warn');

      // Should log error and warn
      logger.error('error');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00.000Z] [ERROR]',
        'error',
      );

      consoleErrorSpy.mockClear();
      logger.warn('warning');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00.000Z] [WARN]',
        'warning',
      );

      // Should not log info, debug, or trace
      consoleErrorSpy.mockClear();
      logger.info('info');
      logger.debug('debug');
      logger.trace('trace');
      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it('should log all levels when set to trace', () => {
      const logger = new Logger('trace');
      const messages = [
        ['error', 'ERROR'],
        ['warn', 'WARN'],
        ['info', 'INFO'],
        ['debug', 'DEBUG'],
        ['trace', 'TRACE'],
      ];

      messages.forEach(([method, level]) => {
        consoleErrorSpy.mockClear();
        (logger as any)[method](`${method} message`);
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          `[2024-01-01T12:00:00.000Z] [${level}]`,
          `${method} message`,
        );
      });
    });
  });

  describe('Multiple Arguments', () => {
    it('should handle multiple arguments', () => {
      const logger = new Logger('info');
      const obj = { key: 'value' };
      const arr = [1, 2, 3];

      logger.info('message', obj, arr, 123);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00.000Z] [INFO]',
        'message',
        obj,
        arr,
        123,
      );
    });

    it('should handle error objects', () => {
      const logger = new Logger('error');
      const error = new Error('Something went wrong');

      logger.error('Error occurred:', error);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00.000Z] [ERROR]',
        'Error occurred:',
        error,
      );
    });
  });

  describe('Output Format', () => {
    it('should format timestamp correctly', () => {
      const logger = new Logger('info');

      // Test different times
      vi.setSystemTime(new Date('2024-12-31T23:59:59Z'));
      logger.info('end of year');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-12-31T23:59:59.000Z] [INFO]',
        'end of year',
      );

      consoleErrorSpy.mockClear();
      vi.setSystemTime(new Date('2025-01-01T00:00:00Z'));
      logger.info('new year');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2025-01-01T00:00:00.000Z] [INFO]',
        'new year',
      );
    });

    it('should uppercase log level in output', () => {
      const logger = new Logger('debug');

      logger.debug('debug message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[DEBUG]'),
        'debug message',
      );

      consoleErrorSpy.mockClear();
      logger.warn('warning message');
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[WARN]'),
        'warning message',
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle no arguments', () => {
      const logger = new Logger('info');
      logger.info();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00.000Z] [INFO]',
      );
    });

    it('should handle undefined and null', () => {
      const logger = new Logger('info');
      logger.info(undefined, null);

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[2024-01-01T12:00:00.000Z] [INFO]',
        undefined,
        null,
      );
    });

    it('should output to stderr not stdout', () => {
      // The implementation uses console.error which outputs to stderr
      // This is important for STDIO protocol compatibility
      const logger = new Logger('info');
      logger.info('test');

      expect(consoleErrorSpy).toHaveBeenCalled();
      // console.log would output to stdout, but we use console.error for stderr
    });
  });
});
