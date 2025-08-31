/**
 * Tests for StreamableHTTPTransport
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SSEStream, StreamableHTTPTransportOptions } from './streamable-http-transport.js';
import { StreamableHTTPTransport } from './streamable-http-transport.js';

describe('StreamableHTTPTransport', () => {
  let transport: StreamableHTTPTransport;
  let mockStream: SSEStream;

  beforeEach(() => {
    mockStream = {
      closed: false,
      close: vi.fn(async () => {
        mockStream.closed = true;
      }),
      write: vi.fn(async () => {}),
      onAbort: vi.fn()
    };

    const options: StreamableHTTPTransportOptions = {
      sessionIdGenerator: () => 'test-session-id',
      enableJsonResponse: true,
      onsessioninitialized: vi.fn(),
      onsessionclosed: vi.fn()
    };

    transport = new StreamableHTTPTransport(options);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create transport with default options', () => {
      const defaultTransport = new StreamableHTTPTransport();
      expect(defaultTransport).toBeInstanceOf(StreamableHTTPTransport);
    });

    it('should create transport with custom options', () => {
      const customTransport = new StreamableHTTPTransport({
        sessionIdGenerator: () => 'custom-id',
        enableJsonResponse: false
      });
      expect(customTransport).toBeInstanceOf(StreamableHTTPTransport);
    });
  });

  describe('Start', () => {
    it('should start transport', async () => {
      await expect(transport.start()).resolves.not.toThrow();
    });

    it('should throw if already started', async () => {
      await transport.start();
      await expect(transport.start()).rejects.toThrow('Transport already started');
    });
  });

  describe('Close', () => {
    it('should close transport', async () => {
      await transport.start();
      await expect(transport.close()).resolves.not.toThrow();
    });

    it('should handle close when not started', async () => {
      await expect(transport.close()).resolves.not.toThrow();
    });

    it('should call onclose callback', async () => {
      const onclose = vi.fn();
      transport.onclose = onclose;

      await transport.start();
      await transport.close();

      expect(onclose).toHaveBeenCalled();
    });

    it('should call onsessionclosed when session exists', async () => {
      const onsessionclosed = vi.fn();
      const transportWithCallback = new StreamableHTTPTransport({
        onsessionclosed
      });

      transportWithCallback.sessionId = 'test-session';
      await transportWithCallback.start();
      await transportWithCallback.close();

      expect(onsessionclosed).toHaveBeenCalledWith('test-session');
    });
  });

  describe('Send', () => {
    it('should throw if transport not started', async () => {
      const message = { jsonrpc: '2.0' as const, id: 1, result: 'test' };
      await expect(transport.send(message)).rejects.toThrow('Transport not started');
    });

    it('should handle response messages', async () => {
      await transport.start();

      const message = {
        jsonrpc: '2.0' as const,
        id: 1,
        result: { data: 'test' }
      };

      // Store response in map
      await transport.send(message);

      // Response should be stored
      expect((transport as any).requestResponseMap.has(1)).toBe(true);
    });

    it('should handle error messages', async () => {
      await transport.start();

      const message = {
        jsonrpc: '2.0' as const,
        id: 2,
        error: {
          code: -32600,
          message: 'Invalid Request'
        }
      };

      await transport.send(message);

      // Error should be stored
      expect((transport as any).requestResponseMap.has(2)).toBe(true);
    });

    it('should handle notification messages', async () => {
      await transport.start();

      const notification = {
        jsonrpc: '2.0' as const,
        method: 'test/notification',
        params: { data: 'test' }
      };

      // Should not throw
      await expect(transport.send(notification)).resolves.not.toThrow();
    });
  });

  describe('HTTP Request Handling', () => {
    it('should handle GET request and setup SSE', async () => {
      await transport.start();

      const headers = { 'mcp-session-id': 'test-session' };
      const result = await transport.handleHttpRequest('GET', headers, undefined, mockStream);

      expect(result).toBeUndefined(); // SSE response
      expect(transport.sessionId).toBe('test-session');
    });

    it('should handle POST request with JSON response', async () => {
      await transport.start();

      const headers = {
        'mcp-session-id': 'test-session',
        accept: 'application/json'
      };
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'test/method',
        params: {}
      };

      // Set up onmessage handler to respond
      transport.onmessage = async (msg) => {
        if (msg.id === 1) {
          await transport.send({
            jsonrpc: '2.0',
            id: 1,
            result: { success: true }
          });
        }
      };

      const result = await transport.handleHttpRequest('POST', headers, body);

      expect(result?.status).toBe(200);
      expect(result?.headers?.['mcp-session-id']).toBe('test-session');
    });

    it('should handle DELETE request', async () => {
      await transport.start();

      const headers = { 'mcp-session-id': 'test-session' };
      const result = await transport.handleHttpRequest('DELETE', headers);

      expect(result?.status).toBe(200);
    });

    it('should reject unsupported HTTP methods', async () => {
      await transport.start();

      const result = await transport.handleHttpRequest('PUT', {});

      expect(result?.status).toBe(405);
      expect(result?.headers?.Allow).toBe('GET, POST, DELETE');
    });
  });

  describe('SSE and Progress Notifications', () => {
    it('should send progress notification', async () => {
      await transport.start();

      await transport.sendProgressNotification('token-1', 50, 100, 'Processing');

      // Since there's no stream registered, it should not throw
      expect(true).toBe(true);
    });

    it('should handle SSE response for tool calls', async () => {
      await transport.start();

      const headers = {
        accept: 'text/event-stream',
        'mcp-session-id': 'test-session'
      };
      const body = {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: {
          name: 'test_tool',
          arguments: {},
          _meta: { progressToken: 'progress-1' }
        }
      };

      // Set up response handler
      transport.onmessage = async (msg) => {
        if (msg.id === 1) {
          // Send progress
          await transport.sendProgressNotification('progress-1', 50, 100);
          // Send result
          await transport.send({
            jsonrpc: '2.0',
            id: 1,
            result: { success: true }
          });
        }
      };

      const result = await transport.handleHttpRequest('POST', headers, body, mockStream);

      expect(result?.status).toBe(200);
    });
  });

  describe('Internal State Management', () => {
    it('should maintain stream mapping', async () => {
      await transport.start();

      // GET request should create stream mapping
      const headers = { 'mcp-session-id': 'test-session' };
      await transport.handleHttpRequest('GET', headers, undefined, mockStream);

      // Check internal state
      expect((transport as any).sessionIdToStream.has('test-session')).toBe(true);
    });

    it('should cleanup on close', async () => {
      await transport.start();

      // Add some internal state
      const headers = { 'mcp-session-id': 'test-session' };
      await transport.handleHttpRequest('GET', headers, undefined, mockStream);

      await transport.close();

      // Check state is cleared
      expect((transport as any).streamMapping.size).toBe(0);
      expect((transport as any).sessionIdToStream.size).toBe(0);
    });

    it('should handle cleanup interval', async () => {
      const originalSetInterval = global.setInterval;
      const mockSetInterval = vi.fn(originalSetInterval);
      global.setInterval = mockSetInterval as any;

      const transportWithCleanup = new StreamableHTTPTransport();
      await transportWithCleanup.start();

      // Cleanup interval should be started
      expect(mockSetInterval).toHaveBeenCalled();

      await transportWithCleanup.close();

      global.setInterval = originalSetInterval;
    });
  });

  describe('Edge Cases', () => {
    it('should handle notification-only POST request', async () => {
      await transport.start();

      const headers = { accept: 'application/json' };
      const body = {
        jsonrpc: '2.0',
        method: 'notification/test'
      };

      const result = await transport.handleHttpRequest('POST', headers, body);

      expect(result?.status).toBe(202); // Accepted for notifications
    });

    it('should reject invalid Accept header', async () => {
      await transport.start();

      const headers = { accept: 'text/plain' };
      const body = { jsonrpc: '2.0', id: 1, method: 'test' };

      const result = await transport.handleHttpRequest('POST', headers, body);

      expect(result?.status).toBe(406); // Not Acceptable
      expect(result?.body?.error?.message).toContain('Not Acceptable');
    });

    it('should handle initialization with session', async () => {
      const onsessioninitialized = vi.fn();
      const transportWithCallback = new StreamableHTTPTransport({
        onsessioninitialized
      });

      await transportWithCallback.start();

      const headers = {
        'mcp-session-id': 'init-session',
        accept: 'application/json'
      };
      const body = [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '1.0.0',
            capabilities: {},
            clientInfo: { name: 'test', version: '1.0' }
          }
        }
      ];

      transportWithCallback.onmessage = async (msg) => {
        if (msg.id === 1) {
          await transportWithCallback.send({
            jsonrpc: '2.0',
            id: 1,
            result: { protocolVersion: '1.0.0', capabilities: {} }
          });
        }
      };

      const result = await transportWithCallback.handleHttpRequest('POST', headers, body);

      expect(result?.status).toBe(200);
      expect(onsessioninitialized).toHaveBeenCalledWith('init-session');
    });
  });
});
