import { describe, it, expect } from 'vitest';
import {
  HatagoError,
  ConfigError,
  TransportError,
  ToolInvocationError,
  TimeoutError,
  SessionError,
  UnsupportedFeatureError,
  toHatagoError,
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
  describe('HatagoError', () => {
    it('should create base error with message and code', () => {
      const error = new HatagoError('Test error', 'TEST_CODE');

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(HatagoError);
      expect(error.message).toBe('Test error');
      expect(error.code).toBe('TEST_CODE');
      expect(error.name).toBe('HatagoError');
    });

    it('should include cause when provided', () => {
      const cause = new Error('Original error');
      const error = new HatagoError('Wrapped error', 'WRAP_ERROR', { cause });

      expect(error.cause).toBe(cause);
    });

    it('should include data when provided', () => {
      const data = { key: 'value', count: 42 };
      const error = new HatagoError('Error with data', 'DATA_ERROR', { data });

      expect(error.data).toEqual(data);
    });

    it('should capture stack trace', () => {
      const error = new HatagoError('Stack trace test', 'STACK_TEST');

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('HatagoError');
      expect(error.stack).toContain('Stack trace test');
    });
  });

  describe('ConfigError', () => {
    it('should create config error with correct code', () => {
      const error = new ConfigError('Invalid configuration');

      expect(error).toBeInstanceOf(HatagoError);
      expect(error).toBeInstanceOf(ConfigError);
      expect(error.message).toBe('Invalid configuration');
      expect(error.code).toBe('CONFIG_ERROR');
      expect(error.name).toBe('ConfigError');
    });

    it('should accept options', () => {
      const cause = new Error('Parse error');
      const data = { file: 'config.json' };
      const error = new ConfigError('Config parse failed', { cause, data });

      expect(error.cause).toBe(cause);
      expect(error.data).toEqual(data);
    });
  });

  describe('TransportError', () => {
    it('should create transport error with correct code', () => {
      const error = new TransportError('Connection failed');

      expect(error).toBeInstanceOf(HatagoError);
      expect(error).toBeInstanceOf(TransportError);
      expect(error.message).toBe('Connection failed');
      expect(error.code).toBe('TRANSPORT_ERROR');
      expect(error.name).toBe('TransportError');
    });
  });

  describe('ToolInvocationError', () => {
    it('should create tool invocation error with correct code', () => {
      const error = new ToolInvocationError('Tool execution failed');

      expect(error).toBeInstanceOf(HatagoError);
      expect(error).toBeInstanceOf(ToolInvocationError);
      expect(error.message).toBe('Tool execution failed');
      expect(error.code).toBe('TOOL_INVOCATION_ERROR');
      expect(error.name).toBe('ToolInvocationError');
    });
  });

  describe('TimeoutError', () => {
    it('should create timeout error with correct code', () => {
      const error = new TimeoutError('Operation timed out');

      expect(error).toBeInstanceOf(HatagoError);
      expect(error).toBeInstanceOf(TimeoutError);
      expect(error.message).toBe('Operation timed out');
      expect(error.code).toBe('TIMEOUT_ERROR');
      expect(error.name).toBe('TimeoutError');
    });
  });

  describe('SessionError', () => {
    it('should create session error with correct code', () => {
      const error = new SessionError('Session expired');

      expect(error).toBeInstanceOf(HatagoError);
      expect(error).toBeInstanceOf(SessionError);
      expect(error.message).toBe('Session expired');
      expect(error.code).toBe('SESSION_ERROR');
      expect(error.name).toBe('SessionError');
    });
  });

  describe('UnsupportedFeatureError', () => {
    it('should create unsupported feature error with correct code', () => {
      const error = new UnsupportedFeatureError('Feature not available');

      expect(error).toBeInstanceOf(HatagoError);
      expect(error).toBeInstanceOf(UnsupportedFeatureError);
      expect(error.message).toBe('Feature not available');
      expect(error.code).toBe('UNSUPPORTED_FEATURE');
      expect(error.name).toBe('UnsupportedFeatureError');
    });
  });

  describe('toHatagoError', () => {
    it('should return HatagoError as-is', () => {
      const original = new HatagoError('Test', 'TEST');
      const result = toHatagoError(original);

      expect(result).toBe(original);
    });

    it('should convert timeout errors', () => {
      const error = new Error('Request timeout exceeded');
      const result = toHatagoError(error);

      expect(result).toBeInstanceOf(TimeoutError);
      expect(result.message).toBe('Request timeout exceeded');
      expect(result.cause).toBe(error);
    });

    it('should convert transport errors', () => {
      const error = new Error('Failed to connect to server');
      const result = toHatagoError(error);

      expect(result).toBeInstanceOf(TransportError);
      expect(result.message).toBe('Failed to connect to server');
      expect(result.cause).toBe(error);
    });

    it('should convert config errors', () => {
      const error = new Error('Invalid config file');
      const result = toHatagoError(error);

      expect(result).toBeInstanceOf(ConfigError);
      expect(result.message).toBe('Invalid config file');
      expect(result.cause).toBe(error);
    });

    it('should handle transport keyword in message', () => {
      const error = new Error('transport layer failure');
      const result = toHatagoError(error);

      expect(result).toBeInstanceOf(TransportError);
    });

    it('should convert generic errors to HatagoError', () => {
      const error = new Error('Something went wrong');
      const result = toHatagoError(error);

      expect(result).toBeInstanceOf(HatagoError);
      expect(result.code).toBe('INTERNAL_ERROR');
      expect(result.message).toBe('Something went wrong');
      expect(result.cause).toBe(error);
    });

    it('should handle string errors', () => {
      const result = toHatagoError('String error message');

      expect(result).toBeInstanceOf(HatagoError);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('String error message');
      expect(result.cause).toBe('String error message');
    });

    it('should handle number errors', () => {
      const result = toHatagoError(404);

      expect(result).toBeInstanceOf(HatagoError);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('404');
      expect(result.cause).toBe(404);
    });

    it('should handle null errors', () => {
      const result = toHatagoError(null);

      expect(result).toBeInstanceOf(HatagoError);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('null');
      expect(result.cause).toBe(null);
    });

    it('should handle undefined errors', () => {
      const result = toHatagoError(undefined);

      expect(result).toBeInstanceOf(HatagoError);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('undefined');
      expect(result.cause).toBe(undefined);
    });

    it('should handle object errors', () => {
      const obj = { error: 'Object error', code: 123 };
      const result = toHatagoError(obj);

      expect(result).toBeInstanceOf(HatagoError);
      expect(result.code).toBe('UNKNOWN_ERROR');
      expect(result.message).toBe('[object Object]');
      expect(result.cause).toBe(obj);
    });
  });

  describe('Error inheritance', () => {
    it('should maintain instanceof checks through inheritance chain', () => {
      const configError = new ConfigError('Test');

      expect(configError instanceof Error).toBe(true);
      expect(configError instanceof HatagoError).toBe(true);
      expect(configError instanceof ConfigError).toBe(true);
      expect(configError instanceof TransportError).toBe(false);
    });

    it('should have proper error names', () => {
      const errors = [
        new HatagoError('Test', 'TEST'),
        new ConfigError('Test'),
        new TransportError('Test'),
        new ToolInvocationError('Test'),
        new TimeoutError('Test'),
        new SessionError('Test'),
        new UnsupportedFeatureError('Test')
      ];

      expect(errors[0].name).toBe('HatagoError');
      expect(errors[1].name).toBe('ConfigError');
      expect(errors[2].name).toBe('TransportError');
      expect(errors[3].name).toBe('ToolInvocationError');
      expect(errors[4].name).toBe('TimeoutError');
      expect(errors[5].name).toBe('SessionError');
      expect(errors[6].name).toBe('UnsupportedFeatureError');
    });
  });

  describe('Error serialization', () => {
    it('should serialize to JSON with custom properties', () => {
      const error = new HatagoError('Test error', 'TEST_CODE', {
        data: { foo: 'bar' }
      });

      const json = JSON.stringify(error);
      const parsed = JSON.parse(json);

      // Note: Error properties like message and stack are not enumerable by default
      // Only our custom properties will be in the JSON
      expect(parsed.code).toBe('TEST_CODE');
      expect(parsed.data).toEqual({ foo: 'bar' });
    });

    it('should handle circular references in cause', () => {
      const error1 = new HatagoError('Error 1', 'CODE1');
      const error2 = new HatagoError('Error 2', 'CODE2', { cause: error1 });

      // This should not throw
      expect(() => {
        const str = error2.toString();
        expect(str).toContain('Error 2');
      }).not.toThrow();
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

    it('should convert legacy HatagoError class', () => {
      const legacyError = new HatagoError('Legacy error', 'CONFIG_ERROR', {
        data: { legacy: true }
      });

      const error = toHatagoErrorType(legacyError);

      expect(error.kind).toBe('config');
      expect(error.message).toBe('Legacy error');
      expect(error.data).toEqual({ legacy: true });
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
