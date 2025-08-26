import { describe, expect, it } from 'vitest';
import {
  ErrorCode,
  ErrorSeverity,
  getErrorMessage,
  getErrorSeverity,
  isErrorCode,
} from './error-codes.js';

describe('ErrorCode', () => {
  describe('isErrorCode', () => {
    it('should return true for valid error codes', () => {
      expect(isErrorCode(ErrorCode.INVALID_CONFIG)).toBe(true);
      expect(isErrorCode(ErrorCode.SERVER_NOT_FOUND)).toBe(true);
      expect(isErrorCode(ErrorCode.TOOL_NOT_FOUND)).toBe(true);
    });

    it('should return false for invalid values', () => {
      expect(isErrorCode('invalid')).toBe(false);
      expect(isErrorCode(null)).toBe(false);
      expect(isErrorCode(undefined)).toBe(false);
      expect(isErrorCode(999999)).toBe(false);
    });
  });

  describe('getErrorSeverity', () => {
    it('should return CRITICAL for security errors', () => {
      expect(getErrorSeverity(ErrorCode.AUTHENTICATION_FAILED)).toBe(
        ErrorSeverity.CRITICAL,
      );
      expect(getErrorSeverity(ErrorCode.SECURITY_VIOLATION)).toBe(
        ErrorSeverity.CRITICAL,
      );
    });

    it('should return CRITICAL for system resource errors', () => {
      expect(getErrorSeverity(ErrorCode.OUT_OF_MEMORY)).toBe(
        ErrorSeverity.CRITICAL,
      );
      expect(getErrorSeverity(ErrorCode.DISK_FULL)).toBe(
        ErrorSeverity.CRITICAL,
      );
      expect(getErrorSeverity(ErrorCode.STORAGE_CORRUPTION)).toBe(
        ErrorSeverity.CRITICAL,
      );
    });

    it('should return HIGH for server and transport errors', () => {
      expect(getErrorSeverity(ErrorCode.SERVER_START_FAILED)).toBe(
        ErrorSeverity.HIGH,
      );
      expect(getErrorSeverity(ErrorCode.TRANSPORT_ERROR)).toBe(
        ErrorSeverity.HIGH,
      );
      expect(getErrorSeverity(ErrorCode.HUB_NOT_INITIALIZED)).toBe(
        ErrorSeverity.HIGH,
      );
    });

    it('should return MEDIUM for tool and session errors', () => {
      expect(getErrorSeverity(ErrorCode.TOOL_NOT_FOUND)).toBe(
        ErrorSeverity.MEDIUM,
      );
      expect(getErrorSeverity(ErrorCode.SESSION_NOT_FOUND)).toBe(
        ErrorSeverity.MEDIUM,
      );
      expect(getErrorSeverity(ErrorCode.STORAGE_READ_ERROR)).toBe(
        ErrorSeverity.MEDIUM,
      );
    });

    it('should return LOW for configuration errors', () => {
      expect(getErrorSeverity(ErrorCode.INVALID_CONFIG)).toBe(
        ErrorSeverity.LOW,
      );
      expect(getErrorSeverity(ErrorCode.CONFIG_NOT_FOUND)).toBe(
        ErrorSeverity.LOW,
      );
    });
  });

  describe('getErrorMessage', () => {
    it('should return correct messages for configuration errors', () => {
      expect(getErrorMessage(ErrorCode.INVALID_CONFIG)).toBe(
        'Invalid configuration',
      );
      expect(getErrorMessage(ErrorCode.CONFIG_NOT_FOUND)).toBe(
        'Configuration file not found',
      );
    });

    it('should return correct messages for server errors', () => {
      expect(getErrorMessage(ErrorCode.SERVER_NOT_FOUND)).toBe(
        'Server not found',
      );
      expect(getErrorMessage(ErrorCode.SERVER_START_FAILED)).toBe(
        'Failed to start server',
      );
    });

    it('should return correct messages for tool errors', () => {
      expect(getErrorMessage(ErrorCode.TOOL_NOT_FOUND)).toBe('Tool not found');
      expect(getErrorMessage(ErrorCode.TOOL_EXECUTION_FAILED)).toBe(
        'Tool execution failed',
      );
    });

    it('should return Unknown error for invalid code', () => {
      expect(getErrorMessage(999999 as ErrorCode)).toBe('Unknown error');
    });
  });
});
