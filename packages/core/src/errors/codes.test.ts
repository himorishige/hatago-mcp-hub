/**
 * Tests for error codes and severity
 */

import { describe, expect, it } from 'vitest';
import { ErrorCode, type ErrorContext, ErrorSeverity } from './codes.js';

describe('ErrorCode', () => {
  it('should have unique error codes', () => {
    const codes = Object.values(ErrorCode);
    const uniqueCodes = new Set(codes);
    expect(uniqueCodes.size).toBe(codes.length);
  });

  it('should follow naming convention', () => {
    const codes = Object.values(ErrorCode);
    for (const code of codes) {
      // All error codes should start with E_
      expect(code).toMatch(/^E_[A-Z]+(_[A-Z]+)*$/);
    }
  });

  it('should have proper prefixes', () => {
    // MCP errors
    expect(ErrorCode.E_MCP_INIT_TIMEOUT).toMatch(/^E_MCP_/);
    expect(ErrorCode.E_MCP_CONNECTION_FAILED).toMatch(/^E_MCP_/);

    // NPX errors
    expect(ErrorCode.E_NPX_INSTALL_FAILED).toMatch(/^E_NPX_/);
    expect(ErrorCode.E_NPX_SPAWN_FAILED).toMatch(/^E_NPX_/);

    // Session errors
    expect(ErrorCode.E_SESSION_NOT_FOUND).toMatch(/^E_SESSION_/);
    expect(ErrorCode.E_SESSION_EXPIRED).toMatch(/^E_SESSION_/);

    // Config errors
    expect(ErrorCode.E_CONFIG_INVALID).toMatch(/^E_CONFIG_/);
    expect(ErrorCode.E_CONFIG_NOT_FOUND).toMatch(/^E_CONFIG_/);

    // Tool errors
    expect(ErrorCode.E_TOOL_NAME_COLLISION).toMatch(/^E_TOOL_/);
    expect(ErrorCode.E_TOOL_NOT_FOUND).toMatch(/^E_TOOL_/);

    // State errors
    expect(ErrorCode.E_STATE_INVALID_TRANSITION).toMatch(/^E_STATE_/);
    expect(ErrorCode.E_STATE_ALREADY_RUNNING).toMatch(/^E_STATE_/);

    // Security errors
    expect(ErrorCode.E_SECURITY_POLICY_DENIED).toMatch(/^E_SECURITY_/);
    expect(ErrorCode.E_SECURITY_ENCRYPTION_FAILED).toMatch(/^E_SECURITY_/);

    // System errors
    expect(ErrorCode.E_SYSTEM_RESOURCE_EXHAUSTED).toMatch(/^E_SYSTEM_/);
    expect(ErrorCode.E_SYSTEM_FILE_NOT_FOUND).toMatch(/^E_SYSTEM_/);
  });
});

describe('ErrorSeverity', () => {
  it('should have all expected severity levels', () => {
    expect(ErrorSeverity.CRITICAL).toBe('critical');
    expect(ErrorSeverity.ERROR).toBe('error');
    expect(ErrorSeverity.WARNING).toBe('warning');
    expect(ErrorSeverity.INFO).toBe('info');
  });

  it('should have appropriate values for comparison', () => {
    // Severity should be comparable for filtering
    const severities = Object.values(ErrorSeverity);
    expect(severities).toHaveLength(4);
    expect(severities).toEqual(['critical', 'error', 'warning', 'info']);
  });
});

describe('ErrorContext', () => {
  it('should accept optional fields', () => {
    const context: ErrorContext = {};
    expect(context).toBeDefined();
  });

  it('should accept all defined fields', () => {
    const context: ErrorContext = {
      serverId: 'server1',
      sessionId: 'session1',
      toolName: 'test_tool',
      configPath: '/path/to/config',
      timestamp: new Date(),
      stack: 'Error stack trace',
    };

    expect(context.serverId).toBe('server1');
    expect(context.sessionId).toBe('session1');
    expect(context.toolName).toBe('test_tool');
    expect(context.configPath).toBe('/path/to/config');
    expect(context.timestamp).toBeInstanceOf(Date);
    expect(context.stack).toBe('Error stack trace');
  });

  it('should accept additional fields', () => {
    const context: ErrorContext = {
      serverId: 'server1',
      customField: 'custom value',
      numericField: 42,
      booleanField: true,
    };

    expect(context.customField).toBe('custom value');
    expect(context.numericField).toBe(42);
    expect(context.booleanField).toBe(true);
  });
});

describe('Error Code Categories', () => {
  it('should have consistent MCP error codes', () => {
    const mcpCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_MCP_'),
    );
    expect(mcpCodes).toContain('E_MCP_INIT_TIMEOUT');
    expect(mcpCodes).toContain('E_MCP_TOOL_DISCOVERY_EMPTY');
    expect(mcpCodes).toContain('E_MCP_CONNECTION_FAILED');
    expect(mcpCodes).toContain('E_MCP_PROTOCOL_ERROR');
    expect(mcpCodes).toContain('E_MCP_INVALID_REQUEST');
  });

  it('should have consistent NPX error codes', () => {
    const npxCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_NPX_'),
    );
    expect(npxCodes).toContain('E_NPX_INSTALL_FAILED');
    expect(npxCodes).toContain('E_NPX_PACKAGE_NOT_FOUND');
    expect(npxCodes).toContain('E_NPX_SPAWN_FAILED');
    expect(npxCodes).toContain('E_NPX_CACHE_CHECK_FAILED');
    expect(npxCodes).toContain('E_NPX_WARMUP_FAILED');
  });

  it('should have consistent session error codes', () => {
    const sessionCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_SESSION_'),
    );
    expect(sessionCodes).toContain('E_SESSION_NOT_FOUND');
    expect(sessionCodes).toContain('E_SESSION_EXPIRED');
    expect(sessionCodes).toContain('E_SESSION_VERSION_CONFLICT');
    expect(sessionCodes).toContain('E_SESSION_LOCK_TIMEOUT');
    expect(sessionCodes).toContain('E_SESSION_INVALID_TOKEN');
  });

  it('should have consistent config error codes', () => {
    const configCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_CONFIG_'),
    );
    expect(configCodes).toContain('E_CONFIG_INVALID');
    expect(configCodes).toContain('E_CONFIG_NOT_FOUND');
    expect(configCodes).toContain('E_CONFIG_PARSE_ERROR');
    expect(configCodes).toContain('E_CONFIG_VALIDATION_FAILED');
  });

  it('should have consistent tool error codes', () => {
    const toolCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_TOOL_'),
    );
    expect(toolCodes).toContain('E_TOOL_NAME_COLLISION');
    expect(toolCodes).toContain('E_TOOL_NOT_FOUND');
    expect(toolCodes).toContain('E_TOOL_EXECUTION_FAILED');
  });

  it('should have consistent state error codes', () => {
    const stateCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_STATE_'),
    );
    expect(stateCodes).toContain('E_STATE_INVALID_TRANSITION');
    expect(stateCodes).toContain('E_STATE_ALREADY_RUNNING');
    expect(stateCodes).toContain('E_STATE_NOT_RUNNING');
  });

  it('should have consistent security error codes', () => {
    const securityCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_SECURITY_'),
    );
    expect(securityCodes).toContain('E_SECURITY_POLICY_DENIED');
    expect(securityCodes).toContain('E_SECURITY_ENCRYPTION_FAILED');
    expect(securityCodes).toContain('E_SECURITY_DECRYPTION_FAILED');
    expect(securityCodes).toContain('E_SECURITY_KEY_NOT_FOUND');
  });

  it('should have consistent system error codes', () => {
    const systemCodes = Object.values(ErrorCode).filter((code) =>
      code.startsWith('E_SYSTEM_'),
    );
    expect(systemCodes).toContain('E_SYSTEM_RESOURCE_EXHAUSTED');
    expect(systemCodes).toContain('E_SYSTEM_FILE_NOT_FOUND');
    expect(systemCodes).toContain('E_SYSTEM_PERMISSION_DENIED');
    expect(systemCodes).toContain('E_SYSTEM_NETWORK_ERROR');
    expect(systemCodes).toContain('E_SYSTEM_SECURITY_ERROR');
    expect(systemCodes).toContain('E_SYSTEM_FS_ERROR');
    expect(systemCodes).toContain('E_SYSTEM_UNKNOWN');
  });
});
