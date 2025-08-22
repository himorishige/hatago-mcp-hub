import { describe, expect, it } from 'vitest';
import { ErrorCode, ErrorHelpers, ErrorSeverity } from './errors.js';
import { err } from './result.js';
import {
  getJsonRpcErrorCode,
  isServerError,
  isStandardJsonRpcError,
  resultToJsonRpc,
  toJsonRpcError,
  toJsonRpcErrorResponse,
} from './result-jsonrpc.js';

describe('Result to JSON-RPC conversion', () => {
  describe('getJsonRpcErrorCode', () => {
    it('should map MCP connection errors correctly', () => {
      const error = ErrorHelpers.mcpConnectionFailed('test-server');
      expect(getJsonRpcErrorCode(error)).toBe(-32001);
    });

    it('should map tool not found to method not found', () => {
      const error = ErrorHelpers.toolNotFound('test-tool');
      expect(getJsonRpcErrorCode(error)).toBe(-32601);
    });

    it('should map config errors to invalid request', () => {
      const error = ErrorHelpers.invalidConfiguration();
      expect(getJsonRpcErrorCode(error)).toBe(-32600);
    });

    it('should default to internal error for unmapped codes', () => {
      const error = ErrorHelpers.createErrorFromUnknown(new Error('test'));
      expect(getJsonRpcErrorCode(error)).toBe(-32603);
    });
  });

  describe('toJsonRpcError', () => {
    it('should convert HatagoError to JSON-RPC error', () => {
      const error = ErrorHelpers.mcpConnectionFailed('test-server', 'timeout');
      const result = err(error);
      const jsonRpcError = toJsonRpcError(result);

      expect(jsonRpcError).toEqual({
        code: -32001,
        message: expect.stringContaining(
          'Failed to connect to MCP server test-server',
        ),
        data: {
          hatagoCode: ErrorCode.E_MCP_CONNECTION_FAILED,
          severity: ErrorSeverity.ERROR,
          context: {
            serverId: 'test-server',
            reason: 'timeout',
          },
          recoverable: true,
        },
      });
    });

    it('should include all error metadata in data field', () => {
      const error = ErrorHelpers.sessionExpired('session-123');
      const result = err(error);
      const jsonRpcError = toJsonRpcError(result);

      expect(jsonRpcError.data).toHaveProperty('hatagoCode');
      expect(jsonRpcError.data).toHaveProperty('severity');
      expect(jsonRpcError.data).toHaveProperty('context');
      expect(jsonRpcError.data).toHaveProperty('recoverable');
    });
  });

  describe('toJsonRpcErrorResponse', () => {
    it('should create full JSON-RPC error response', () => {
      const error = ErrorHelpers.toolNotFound('missing-tool', 'server-1');
      const result = err(error);
      const response = toJsonRpcErrorResponse(result, 123);

      expect(response).toEqual({
        jsonrpc: '2.0',
        error: {
          code: -32601,
          message: expect.stringContaining('Tool not found: missing-tool'),
          data: expect.any(Object),
        },
        id: 123,
      });
    });

    it('should handle null id', () => {
      const error = ErrorHelpers.invalidConfiguration();
      const result = err(error);
      const response = toJsonRpcErrorResponse(result);

      expect(response.id).toBeNull();
    });
  });

  describe('resultToJsonRpc', () => {
    it('should convert success result to JSON-RPC response', () => {
      const result = { ok: true as const, value: { data: 'test' } };
      const response = resultToJsonRpc(result, 'req-1');

      expect(response).toEqual({
        jsonrpc: '2.0',
        result: { data: 'test' },
        id: 'req-1',
      });
    });

    it('should convert error result to JSON-RPC error response', () => {
      const error = ErrorHelpers.mcpProtocolError(
        'server-1',
        'invalid version',
      );
      const result = err(error);
      const response = resultToJsonRpc(result, 42);

      expect(response).toEqual({
        jsonrpc: '2.0',
        error: expect.objectContaining({
          code: -32003,
          message: expect.stringContaining('MCP protocol error'),
        }),
        id: 42,
      });
    });
  });

  describe('isServerError', () => {
    it('should identify server error codes', () => {
      expect(isServerError(-32001)).toBe(true);
      expect(isServerError(-32050)).toBe(true);
      expect(isServerError(-32099)).toBe(true);
      expect(isServerError(-32000)).toBe(true);
    });

    it('should reject non-server error codes', () => {
      expect(isServerError(-32600)).toBe(false);
      expect(isServerError(-32100)).toBe(false);
      expect(isServerError(-31999)).toBe(false);
    });
  });

  describe('isStandardJsonRpcError', () => {
    it('should identify standard JSON-RPC errors', () => {
      expect(isStandardJsonRpcError(-32700)).toBe(true); // Parse error
      expect(isStandardJsonRpcError(-32600)).toBe(true); // Invalid Request
      expect(isStandardJsonRpcError(-32601)).toBe(true); // Method not found
      expect(isStandardJsonRpcError(-32602)).toBe(true); // Invalid params
      expect(isStandardJsonRpcError(-32603)).toBe(true); // Internal error
    });

    it('should reject non-standard error codes', () => {
      expect(isStandardJsonRpcError(-32001)).toBe(false);
      expect(isStandardJsonRpcError(-32000)).toBe(false);
      expect(isStandardJsonRpcError(-32604)).toBe(false);
    });
  });
});
