import { describe, it, expect } from 'vitest';
import {
  ConfigError,
  TransportError,
  ToolInvocationError,
  TimeoutError,
  SessionError,
  UnsupportedFeatureError,
  // New functional API
  createHatagoError,
  toHatagoErrorType,
  toError,
  isConfigError,
  isTransportError,
  isToolInvocationError,
  isTimeoutError,
  isSessionError,
  isUnsupportedFeatureError,
  isInternalError,
  isUnknownError,
  type HatagoErrorType
} from './errors.js';

describe('Errors', () => {
  describe('ConfigError', () => {
    it('should create config error with correct code', () => {
      const error = new ConfigError('Invalid configuration');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.message).toBe('Invalid configuration');
      expect(error.name).toBe('ConfigError');
    });

    it('should accept options', () => {
      const cause = new Error('Parse error');
      const error = new ConfigError('Config parse failed', { cause });

      expect(error.cause).toBe(cause);
    });
  });

  describe('TransportError', () => {
    it('should create transport error with correct code', () => {
      const error = new TransportError('Connection failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TransportError);
      expect(error.message).toBe('Connection failed');
      expect(error.name).toBe('TransportError');
    });
  });

  describe('ToolInvocationError', () => {
    it('should create tool invocation error with correct code', () => {
      const error = new ToolInvocationError('Tool execution failed');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(ToolInvocationError);
      expect(error.message).toBe('Tool execution failed');
      expect(error.name).toBe('ToolInvocationError');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with correct code', () => {
      const error = new TimeoutError('Operation timed out');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.message).toBe('Operation timed out');
      expect(error.name).toBe('TimeoutError');
    });
  });

  describe('SessionError', () => {
    it('should create session error with correct code', () => {
      const error = new SessionError('Session expired');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(SessionError);
      expect(error.message).toBe('Session expired');
      expect(error.name).toBe('SessionError');
    });
  });

  describe('UnsupportedFeatureError', () => {
    it('should create unsupported feature error with correct code', () => {
      const error = new UnsupportedFeatureError('Feature not available');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(UnsupportedFeatureError);
      expect(error.message).toBe('Feature not available');
      expect(error.name).toBe('UnsupportedFeatureError');
    });
  });

  describe('Error inheritance', () => {
    it('should maintain instanceof checks through inheritance chain', () => {
      const configError = new ConfigError('Test');

      expect(configError instanceof Error).toBe(true);
      expect(configError instanceof ConfigError).toBe(true);
      expect(configError instanceof TransportError).toBe(false);
    });

    it('should have proper error names', () => {
      const errors = [
        new ConfigError('Test'),
        new TransportError('Test'),
        new ToolInvocationError('Test'),
        new TimeoutError('Test'),
        new SessionError('Test'),
        new UnsupportedFeatureError('Test')
      ];

      expect(errors[0].name).toBe('ConfigError');
      expect(errors[1].name).toBe('TransportError');
      expect(errors[2].name).toBe('ToolInvocationError');
      expect(errors[3].name).toBe('TimeoutError');
      expect(errors[4].name).toBe('SessionError');
      expect(errors[5].name).toBe('UnsupportedFeatureError');
    });
  });
});

describe('Functional Error API', () => {
  describe('createHatagoError', () => {
    it('should create config error', () => {
      const error = createHatagoError('config', 'Configuration is invalid', {
        data: { field: 'port' }
      });

      expect(error.kind).toBe('config');
      expect(error.message).toBe('Configuration is invalid');
      expect(error.data).toEqual({ field: 'port' });
      expect(isConfigError(error)).toBe(true);
    });

    it('should create transport error', () => {
      const error = createHatagoError('transport', 'Connection failed');

      expect(error.kind).toBe('transport');
      expect(error.message).toBe('Connection failed');
      expect(isTransportError(error)).toBe(true);
    });

    it('should create timeout error with extra field', () => {
      const error = createHatagoError('timeout', 'Operation timed out', {
        timeoutMs: 5000
      });

      expect(error.kind).toBe('timeout');
      expect(error.message).toBe('Operation timed out');
      if (error.kind === 'timeout') {
        expect(error.timeoutMs).toBe(5000);
      }
      expect(isTimeoutError(error)).toBe(true);
    });

    it('should create session error with sessionId', () => {
      const error = createHatagoError('session', 'Session expired', {
        sessionId: 'abc123'
      });

      expect(error.kind).toBe('session');
      if (error.kind === 'session') {
        expect(error.sessionId).toBe('abc123');
      }
      expect(isSessionError(error)).toBe(true);
    });
  });

  describe('Type guards', () => {
    const errors: HatagoErrorType[] = [
      createHatagoError('config', 'config error'),
      createHatagoError('transport', 'transport error'),
      createHatagoError('tool_invocation', 'tool error'),
      createHatagoError('timeout', 'timeout error'),
      createHatagoError('session', 'session error'),
      createHatagoError('unsupported_feature', 'feature error'),
      createHatagoError('internal', 'internal error'),
      createHatagoError('unknown', 'unknown error')
    ];

    it('should correctly identify error types', () => {
      expect(isConfigError(errors[0])).toBe(true);
      expect(isTransportError(errors[1])).toBe(true);
      expect(isToolInvocationError(errors[2])).toBe(true);
      expect(isTimeoutError(errors[3])).toBe(true);
      expect(isSessionError(errors[4])).toBe(true);
      expect(isUnsupportedFeatureError(errors[5])).toBe(true);
      expect(isInternalError(errors[6])).toBe(true);
      expect(isUnknownError(errors[7])).toBe(true);
    });

    it('should return false for wrong types', () => {
      const configError = createHatagoError('config', 'test');
      expect(isTransportError(configError)).toBe(false);
      expect(isTimeoutError(configError)).toBe(false);
      expect(isSessionError(configError)).toBe(false);
    });
  });

  describe('toError', () => {
    it('should convert HatagoErrorType to Error', () => {
      const hatagoError = createHatagoError('config', 'Config invalid', {
        cause: new Error('Original'),
        data: { test: true }
      });

      const error = toError(hatagoError);

      expect(error).toBeInstanceOf(Error);
      expect(error.message).toBe('Config invalid');
      expect(error.name).toBe('HatagoError:config');
      expect(error.cause).toBeInstanceOf(Error);
      expect((error.cause as Error).message).toBe('Original');
    });
  });

  describe('toHatagoErrorType', () => {
    it('should return HatagoErrorType unchanged', () => {
      const error = createHatagoError('config', 'test');
      expect(toHatagoErrorType(error)).toBe(error);
    });

    it('should detect error type from message patterns', () => {
      const timeoutError = toHatagoErrorType(new Error('Connection timeout'));
      expect(timeoutError.kind).toBe('timeout');
      expect(timeoutError.message).toBe('Connection timeout');

      const transportError = toHatagoErrorType(new Error('Transport layer failed'));
      expect(transportError.kind).toBe('transport');
      expect(transportError.message).toBe('Transport layer failed');

      const configError = toHatagoErrorType(new Error('Invalid config file'));
      expect(configError.kind).toBe('config');
      expect(configError.message).toBe('Invalid config file');
    });

    it('should handle unknown error types', () => {
      const stringError = toHatagoErrorType('string error');
      expect(stringError.kind).toBe('unknown');
      expect(stringError.message).toBe('string error');

      const numberError = toHatagoErrorType(123);
      expect(numberError.kind).toBe('unknown');
      expect(numberError.message).toBe('123');
    });
  });
});
