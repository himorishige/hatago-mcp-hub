import { describe, expect, it } from 'vitest';
import {
  createCriticalError,
  createErrorFromUnknown,
  createWarningError,
  ErrorCode,
  ErrorSeverity,
  HatagoError,
  handleError,
  registerErrorHandler,
} from './errors.js';

describe('Pure error creation functions', () => {
  describe('createCriticalError', () => {
    it('should create error with correct properties', () => {
      const error = createCriticalError(
        ErrorCode.E_CONFIG_INVALID,
        'Configuration is invalid',
      );

      expect(error).toBeInstanceOf(HatagoError);
      expect(error.code).toBe(ErrorCode.E_CONFIG_INVALID);
      expect(error.message).toBe('Configuration is invalid');
      expect(error.severity).toBe(ErrorSeverity.CRITICAL);
      expect(error.recoverable).toBe(false);
    });

    it('should include context when provided', () => {
      const context = { configPath: '/path/to/config.json' };
      const error = createCriticalError(
        ErrorCode.E_CONFIG_INVALID,
        'Configuration is invalid',
        context,
      );

      expect(error.context).toEqual(context);
    });
  });

  describe('createWarningError', () => {
    it('should create error with correct properties', () => {
      const error = createWarningError(
        ErrorCode.E_MCP_TOOL_DISCOVERY_EMPTY,
        'No tools discovered',
      );

      expect(error).toBeInstanceOf(HatagoError);
      expect(error.code).toBe(ErrorCode.E_MCP_TOOL_DISCOVERY_EMPTY);
      expect(error.message).toBe('No tools discovered');
      expect(error.severity).toBe(ErrorSeverity.WARNING);
      expect(error.recoverable).toBe(true);
    });

    it('should include context when provided', () => {
      const context = { serverId: 'test-server' };
      const error = createWarningError(
        ErrorCode.E_MCP_TOOL_DISCOVERY_EMPTY,
        'No tools discovered',
        context,
      );

      expect(error.context).toEqual(context);
    });
  });

  describe('createErrorFromUnknown', () => {
    it('should return HatagoError if already HatagoError', () => {
      const originalError = new HatagoError(
        ErrorCode.E_MCP_CONNECTION_FAILED,
        'Connection failed',
      );

      const wrappedError = createErrorFromUnknown(originalError);
      expect(wrappedError).toBe(originalError);
    });

    it('should wrap Error instance', () => {
      const originalError = new Error('Something went wrong');
      const wrappedError = createErrorFromUnknown(originalError);

      expect(wrappedError).toBeInstanceOf(HatagoError);
      expect(wrappedError.message).toBe('Something went wrong');
      expect(wrappedError.cause).toBe(originalError);
      expect(wrappedError.code).toBe(ErrorCode.E_SYSTEM_NETWORK_ERROR);
    });

    it('should wrap unknown type', () => {
      const unknownError = 'String error';
      const wrappedError = createErrorFromUnknown(unknownError);

      expect(wrappedError).toBeInstanceOf(HatagoError);
      expect(wrappedError.message).toBe('String error');
      expect(wrappedError.cause).toBeUndefined();
    });

    it('should use custom error code when provided', () => {
      const originalError = new Error('File not found');
      const wrappedError = createErrorFromUnknown(
        originalError,
        ErrorCode.E_SYSTEM_FILE_NOT_FOUND,
      );

      expect(wrappedError.code).toBe(ErrorCode.E_SYSTEM_FILE_NOT_FOUND);
    });

    it('should include context when provided', () => {
      const context = { path: '/missing/file.txt' };
      const originalError = new Error('File not found');
      const wrappedError = createErrorFromUnknown(
        originalError,
        ErrorCode.E_SYSTEM_FILE_NOT_FOUND,
        context,
      );

      expect(wrappedError.context).toEqual(context);
    });
  });
});

describe('HatagoError static methods compatibility', () => {
  it('critical() should use createCriticalError', () => {
    const error = HatagoError.critical(
      ErrorCode.E_SECURITY_POLICY_DENIED,
      'Access denied',
    );

    expect(error).toBeInstanceOf(HatagoError);
    expect(error.severity).toBe(ErrorSeverity.CRITICAL);
    expect(error.recoverable).toBe(false);
  });

  it('warning() should use createWarningError', () => {
    const error = HatagoError.warning(
      ErrorCode.E_SESSION_EXPIRED,
      'Session has expired',
    );

    expect(error).toBeInstanceOf(HatagoError);
    expect(error.severity).toBe(ErrorSeverity.WARNING);
    expect(error.recoverable).toBe(true);
  });

  it('from() should use createErrorFromUnknown', () => {
    const originalError = new Error('Test error');
    const error = HatagoError.from(originalError);

    expect(error).toBeInstanceOf(HatagoError);
    expect(error.message).toBe('Test error');
    expect(error.cause).toBe(originalError);
  });
});

describe('HatagoError class', () => {
  it('should create error with default severity', () => {
    const error = new HatagoError(
      ErrorCode.E_NPX_INSTALL_FAILED,
      'NPX installation failed',
    );

    expect(error.code).toBe(ErrorCode.E_NPX_INSTALL_FAILED);
    expect(error.message).toBe('NPX installation failed');
    expect(error.severity).toBe(ErrorSeverity.ERROR);
    expect(error.recoverable).toBe(false);
  });

  it('should create error with custom options', () => {
    const cause = new Error('Original error');
    const context = { packageName: 'test-package' };

    const error = new HatagoError(
      ErrorCode.E_NPX_PACKAGE_NOT_FOUND,
      'Package not found',
      {
        severity: ErrorSeverity.WARNING,
        recoverable: true,
        cause,
        context,
      },
    );

    expect(error.severity).toBe(ErrorSeverity.WARNING);
    expect(error.recoverable).toBe(true);
    expect(error.cause).toBe(cause);
    expect(error.context).toEqual(context);
  });

  it('should convert to JSON correctly', () => {
    const error = new HatagoError(
      ErrorCode.E_TOOL_NAME_COLLISION,
      'Tool name collision detected',
      {
        severity: ErrorSeverity.ERROR,
        context: { toolName: 'test-tool' },
      },
    );

    const json = error.toJSON();

    expect(json.code).toBe(ErrorCode.E_TOOL_NAME_COLLISION);
    expect(json.message).toBe('Tool name collision detected');
    expect(json.severity).toBe(ErrorSeverity.ERROR);
    expect(json.recoverable).toBe(false);
    expect(json.context).toEqual({ toolName: 'test-tool' });
    expect(json.stack).toBeDefined();
  });

  it('should format string correctly', () => {
    const error = new HatagoError(
      ErrorCode.E_STATE_INVALID_TRANSITION,
      'Invalid state transition',
    );

    const str = error.toString();
    expect(str).toContain('[E_STATE_INVALID_TRANSITION]');
    expect(str).toContain('Invalid state transition');
  });
});

describe('Error handler registration and handling', () => {
  it('should register and call error handler', () => {
    let handlerCalled = false;
    const handler = () => {
      handlerCalled = true;
    };

    registerErrorHandler(ErrorCode.E_SESSION_NOT_FOUND, handler);

    const error = new HatagoError(
      ErrorCode.E_SESSION_NOT_FOUND,
      'Session not found',
    );

    handleError(error);
    expect(handlerCalled).toBe(true);
  });

  it('should handle non-HatagoError using createErrorFromUnknown', () => {
    let capturedError: HatagoError | null = null;
    const handler = (error: HatagoError) => {
      capturedError = error;
    };

    registerErrorHandler(ErrorCode.E_SYSTEM_NETWORK_ERROR, handler);

    const originalError = new Error('Network error');
    handleError(originalError);

    expect(capturedError).not.toBeNull();
    expect(capturedError?.message).toBe('Network error');
    expect(capturedError?.code).toBe(ErrorCode.E_SYSTEM_NETWORK_ERROR);
  });
});

describe('Error integration scenarios', () => {
  it('should handle NPX installation failure', () => {
    const error = createCriticalError(
      ErrorCode.E_NPX_INSTALL_FAILED,
      'Failed to install package @example/mcp-server',
      {
        packageName: '@example/mcp-server',
        exitCode: 1,
      },
    );

    expect(error.severity).toBe(ErrorSeverity.CRITICAL);
    expect(error.recoverable).toBe(false);
    expect(error.context?.packageName).toBe('@example/mcp-server');
  });

  it('should handle session expiration warning', () => {
    const error = createWarningError(
      ErrorCode.E_SESSION_EXPIRED,
      'Session expired, creating new session',
      {
        sessionId: 'old-session-123',
        timestamp: new Date(),
      },
    );

    expect(error.severity).toBe(ErrorSeverity.WARNING);
    expect(error.recoverable).toBe(true);
    expect(error.context?.sessionId).toBe('old-session-123');
  });

  it('should handle security policy denial', () => {
    const error = createCriticalError(
      ErrorCode.E_SECURITY_POLICY_DENIED,
      'Security policy denied access to resource',
      {
        resource: '/etc/passwd',
        action: 'read',
      },
    );

    expect(error.severity).toBe(ErrorSeverity.CRITICAL);
    expect(error.recoverable).toBe(false);
    expect(error.context?.resource).toBe('/etc/passwd');
  });
});
