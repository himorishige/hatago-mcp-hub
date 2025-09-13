/**
 * Tests for logger interface and utilities
 */

import { describe, expect, it, vi } from 'vitest';
import { 
  LOG_LEVELS, 
  type Logger, 
  type LogLevel, 
  SilentLogger, 
  shouldLog,
  createLogger,
  createSilentLogger,
  type LoggerOptions
} from './logger.js';

describe('LOG_LEVELS', () => {
  it('should have correct numeric values', () => {
    expect(LOG_LEVELS.silent).toBe(0);
    expect(LOG_LEVELS.error).toBe(1);
    expect(LOG_LEVELS.warn).toBe(2);
    expect(LOG_LEVELS.info).toBe(3);
    expect(LOG_LEVELS.debug).toBe(4);
    expect(LOG_LEVELS.trace).toBe(5);
  });

  it('should be ordered from least to most verbose', () => {
    expect(LOG_LEVELS.silent).toBeLessThan(LOG_LEVELS.error);
    expect(LOG_LEVELS.error).toBeLessThan(LOG_LEVELS.warn);
    expect(LOG_LEVELS.warn).toBeLessThan(LOG_LEVELS.info);
    expect(LOG_LEVELS.info).toBeLessThan(LOG_LEVELS.debug);
    expect(LOG_LEVELS.debug).toBeLessThan(LOG_LEVELS.trace);
  });
});

describe('shouldLog', () => {
  it('should log errors at all levels except silent', () => {
    expect(shouldLog('silent', 'error')).toBe(false);
    expect(shouldLog('error', 'error')).toBe(true);
    expect(shouldLog('warn', 'error')).toBe(true);
    expect(shouldLog('info', 'error')).toBe(true);
    expect(shouldLog('debug', 'error')).toBe(true);
    expect(shouldLog('trace', 'error')).toBe(true);
  });

  it('should log warnings at warn level and above', () => {
    expect(shouldLog('silent', 'warn')).toBe(false);
    expect(shouldLog('error', 'warn')).toBe(false);
    expect(shouldLog('warn', 'warn')).toBe(true);
    expect(shouldLog('info', 'warn')).toBe(true);
    expect(shouldLog('debug', 'warn')).toBe(true);
    expect(shouldLog('trace', 'warn')).toBe(true);
  });

  it('should log info at info level and above', () => {
    expect(shouldLog('silent', 'info')).toBe(false);
    expect(shouldLog('error', 'info')).toBe(false);
    expect(shouldLog('warn', 'info')).toBe(false);
    expect(shouldLog('info', 'info')).toBe(true);
    expect(shouldLog('debug', 'info')).toBe(true);
    expect(shouldLog('trace', 'info')).toBe(true);
  });

  it('should log debug at debug level and above', () => {
    expect(shouldLog('silent', 'debug')).toBe(false);
    expect(shouldLog('error', 'debug')).toBe(false);
    expect(shouldLog('warn', 'debug')).toBe(false);
    expect(shouldLog('info', 'debug')).toBe(false);
    expect(shouldLog('debug', 'debug')).toBe(true);
    expect(shouldLog('trace', 'debug')).toBe(true);
  });

  it('should log trace only at trace level', () => {
    expect(shouldLog('silent', 'trace')).toBe(false);
    expect(shouldLog('error', 'trace')).toBe(false);
    expect(shouldLog('warn', 'trace')).toBe(false);
    expect(shouldLog('info', 'trace')).toBe(false);
    expect(shouldLog('debug', 'trace')).toBe(false);
    expect(shouldLog('trace', 'trace')).toBe(true);
  });

  it('should not log anything at silent level', () => {
    expect(shouldLog('silent', 'error')).toBe(false);
    expect(shouldLog('silent', 'warn')).toBe(false);
    expect(shouldLog('silent', 'info')).toBe(false);
    expect(shouldLog('silent', 'debug')).toBe(false);
    expect(shouldLog('silent', 'trace')).toBe(false);
  });
});

describe('SilentLogger', () => {
  it('should have silent level', () => {
    const logger = new SilentLogger();
    expect(logger.level).toBe('silent');
  });

  it('should not output anything', () => {
    const logger = new SilentLogger();
    const consoleSpy = {
      error: vi.spyOn(console, 'error').mockImplementation(() => {}),
      warn: vi.spyOn(console, 'warn').mockImplementation(() => {}),
      info: vi.spyOn(console, 'info').mockImplementation(() => {}),
      debug: vi.spyOn(console, 'debug').mockImplementation(() => {}),
      log: vi.spyOn(console, 'log').mockImplementation(() => {})
    };

    logger.error('Error message');
    logger.warn('Warning message');
    logger.info('Info message');
    logger.debug('Debug message');
    logger.trace('Trace message');

    expect(consoleSpy.error).not.toHaveBeenCalled();
    expect(consoleSpy.warn).not.toHaveBeenCalled();
    expect(consoleSpy.info).not.toHaveBeenCalled();
    expect(consoleSpy.debug).not.toHaveBeenCalled();
    expect(consoleSpy.log).not.toHaveBeenCalled();

    // Restore spies
    Object.values(consoleSpy).forEach((spy) => spy.mockRestore());
  });

  it('should handle objects and messages', () => {
    const logger = new SilentLogger();

    // Should not throw
    expect(() => {
      logger.error({ error: 'data' }, 'Error occurred');
      logger.warn({ warning: 'data' }, 'Warning message');
      logger.info({ info: 'data' }, 'Info message');
      logger.debug({ debug: 'data' }, 'Debug message');
      logger.trace({ trace: 'data' }, 'Trace message');
    }).not.toThrow();
  });

  it('should return itself when creating child', () => {
    const logger = new SilentLogger();
    const child = logger.child('[child]');

    expect(child).toBe(logger);
    expect(child.level).toBe('silent');
  });

  it('should handle various input types', () => {
    const logger = new SilentLogger();

    // Should not throw with various types
    expect(() => {
      logger.error('string');
      logger.error(123);
      logger.error(true);
      logger.error(null);
      logger.error(undefined);
      logger.error({ complex: { nested: 'object' } });
      logger.error(['array', 'of', 'items']);
      logger.error(new Error('Error object'));
    }).not.toThrow();
  });
});

describe('Logger Interface', () => {
  it('should define all required methods', () => {
    const mockLogger: Logger = {
      level: 'info',
      error: vi.fn(),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      child: vi.fn()
    };

    expect(mockLogger.level).toBe('info');
    expect(mockLogger.error).toBeDefined();
    expect(mockLogger.warn).toBeDefined();
    expect(mockLogger.info).toBeDefined();
    expect(mockLogger.debug).toBeDefined();
    expect(mockLogger.trace).toBeDefined();
    expect(mockLogger.child).toBeDefined();
  });

  it('should allow optional child method', () => {
    const minimalLogger: Logger = {
      level: 'error',
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
      trace: () => {}
    };

    expect(minimalLogger.child).toBeUndefined();
  });
});

describe('LogLevel types', () => {
  it('should only accept valid log levels', () => {
    const validLevels: LogLevel[] = ['silent', 'error', 'warn', 'info', 'debug', 'trace'];

    for (const level of validLevels) {
      expect(LOG_LEVELS).toHaveProperty(level);
    }
  });
});

describe('createLogger', () => {
  it('should create a logger with default options', () => {
    const logger = createLogger();
    expect(logger.level).toBe('info');
    expect(logger.error).toBeDefined();
    expect(logger.warn).toBeDefined();
    expect(logger.info).toBeDefined();
    expect(logger.debug).toBeDefined();
    expect(logger.trace).toBeDefined();
    expect(logger.child).toBeDefined();
  });

  it('should respect log level configuration', () => {
    const output = vi.fn();
    const logger = createLogger({ level: 'warn', output });

    logger.error('error message');
    logger.warn('warn message');
    logger.info('info message');
    logger.debug('debug message');

    expect(output).toHaveBeenCalledTimes(2); // error and warn only
  });

  it('should format messages correctly in text mode', () => {
    const output = vi.fn();
    const logger = createLogger({ output, json: false });

    logger.info('test message');

    expect(output).toHaveBeenCalledTimes(1);
    const call = output.mock.calls[0][0];
    expect(call).toContain('[INFO]');
    expect(call).toContain('test message');
  });

  it('should format messages correctly in JSON mode', () => {
    const output = vi.fn();
    const logger = createLogger({ output, json: true });

    logger.info('test message');

    expect(output).toHaveBeenCalledTimes(1);
    const call = output.mock.calls[0][0];
    const parsed = JSON.parse(call);
    expect(parsed.level).toBe('info');
    expect(parsed.msg).toBe('test message');
  });

  it('should handle objects and messages separately', () => {
    const output = vi.fn();
    const logger = createLogger({ output, json: true });

    logger.info({ key: 'value' }, 'message text');

    expect(output).toHaveBeenCalledTimes(1);
    const call = output.mock.calls[0][0];
    const parsed = JSON.parse(call);
    expect(parsed.msg).toBe('message text');
    expect(parsed.data).toEqual({ key: 'value' });
  });

  it('should support prefix', () => {
    const output = vi.fn();
    const logger = createLogger({ output, prefix: '[TEST]', json: false });

    logger.info('test message');

    expect(output).toHaveBeenCalledTimes(1);
    const call = output.mock.calls[0][0];
    expect(call).toContain('[TEST]');
  });

  it('should create child loggers with combined prefix', () => {
    const output = vi.fn();
    const parent = createLogger({ output, prefix: '[PARENT]', json: false });
    const child = parent.child?.('CHILD');

    child?.info('test message');

    expect(output).toHaveBeenCalledTimes(1);
    const call = output.mock.calls[0][0];
    expect(call).toContain('[PARENT][CHILD]');
  });
});

describe('createSilentLogger', () => {
  it('should create a silent logger', () => {
    const logger = createSilentLogger();
    expect(logger.level).toBe('silent');
  });

  it('should not output anything', () => {
    const output = vi.fn();
    const logger = createLogger({ level: 'silent', output });

    logger.error('error');
    logger.warn('warn');
    logger.info('info');
    logger.debug('debug');
    logger.trace('trace');

    expect(output).not.toHaveBeenCalled();
  });
});
