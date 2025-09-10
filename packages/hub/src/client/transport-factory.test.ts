import { describe, it, expect, vi, beforeEach, type MockedFunction } from 'vitest';
import { createTransportFactory } from './transport-factory.js';
import type { ServerSpec } from '../types.js';
import type { Logger } from '../logger.js';

// Mock the dynamic imports
vi.mock('@himorishige/hatago-transport/stdio', () => ({
  StdioClientTransport: vi.fn().mockImplementation(() => ({ type: 'stdio' }))
}));

vi.mock('@himorishige/hatago-transport', () => ({
  SSEClientTransport: vi.fn().mockImplementation(() => ({ type: 'sse' }))
}));

vi.mock('@modelcontextprotocol/sdk/client/streamableHttp.js', () => ({
  StreamableHTTPClientTransport: vi.fn().mockImplementation(() => ({ type: 'streamable-http' }))
}));

vi.mock('@himorishige/hatago-runtime', () => ({
  getPlatform: vi.fn(() => ({
    capabilities: {
      hasProcessSpawn: true
    }
  }))
}));

describe('createTransportFactory', () => {
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as Logger;
    vi.clearAllMocks();
  });

  describe('HTTP transport selection', () => {
    it('should use StreamableHTTPClientTransport when type is "http"', async () => {
      const spec: ServerSpec = {
        url: 'https://api.example.com/mcp',
        type: 'http',
        headers: { Authorization: 'Bearer token' }
      };

      const factory = createTransportFactory('test-server', spec, mockLogger);
      const transport = await factory();

      // Verify StreamableHTTPClientTransport was used
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL(spec.url),
        expect.objectContaining({
          fetch: expect.any(Function)
        })
      );

      // Verify SSEClientTransport was NOT used
      const { SSEClientTransport } = await import('@himorishige/hatago-transport');
      expect(SSEClientTransport).not.toHaveBeenCalled();

      // Verify logger output
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Creating StreamableHTTPClientTransport for test-server',
        { url: spec.url }
      );

      expect(transport).toEqual({ type: 'streamable-http' });
    });

    it('should use StreamableHTTPClientTransport when type is not specified (default)', async () => {
      const spec: ServerSpec = {
        url: 'https://api.example.com/mcp'
      };

      const factory = createTransportFactory('test-server', spec, mockLogger);
      const transport = await factory();

      // Verify StreamableHTTPClientTransport was used
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      expect(StreamableHTTPClientTransport).toHaveBeenCalledWith(
        new URL(spec.url),
        expect.objectContaining({
          fetch: undefined // No headers, so fetch should be undefined
        })
      );

      // Verify SSEClientTransport was NOT used
      const { SSEClientTransport } = await import('@himorishige/hatago-transport');
      expect(SSEClientTransport).not.toHaveBeenCalled();

      expect(transport).toEqual({ type: 'streamable-http' });
    });

    it('should use SSEClientTransport when type is "sse"', async () => {
      const spec: ServerSpec = {
        url: 'https://api.example.com/mcp',
        type: 'sse',
        headers: { Authorization: 'Bearer token' }
      };

      const factory = createTransportFactory('test-server', spec, mockLogger);
      const transport = await factory();

      // Verify SSEClientTransport was used
      const { SSEClientTransport } = await import('@himorishige/hatago-transport');
      expect(SSEClientTransport).toHaveBeenCalledWith(
        new URL(spec.url),
        expect.objectContaining({
          fetch: expect.any(Function)
        })
      );

      // Verify StreamableHTTPClientTransport was NOT used
      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      expect(StreamableHTTPClientTransport).not.toHaveBeenCalled();

      // Verify logger output
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Creating SSEClientTransport for test-server',
        { url: spec.url }
      );

      expect(transport).toEqual({ type: 'sse' });
    });

    it('should use StdioClientTransport for command-based servers', async () => {
      const spec: ServerSpec = {
        command: 'node',
        args: ['server.js'],
        env: { NODE_ENV: 'test' },
        cwd: '/path/to/server'
      };

      const factory = createTransportFactory('test-server', spec, mockLogger);
      const transport = await factory();

      // Verify StdioClientTransport was used
      const { StdioClientTransport } = await import('@himorishige/hatago-transport/stdio');
      expect(StdioClientTransport).toHaveBeenCalledWith({
        command: spec.command,
        args: spec.args,
        env: spec.env,
        cwd: spec.cwd
      });

      expect(transport).toEqual({ type: 'stdio' });
    });

    it('should throw error for invalid server specification', async () => {
      const spec: ServerSpec = {} as ServerSpec;

      const factory = createTransportFactory('test-server', spec, mockLogger);

      await expect(factory()).rejects.toThrow('Invalid server specification for test-server');
    });
  });

  describe('header handling', () => {
    it('should pass headers to fetch wrapper for HTTP transport', async () => {
      const spec: ServerSpec = {
        url: 'https://api.example.com/mcp',
        type: 'http',
        headers: {
          Authorization: 'Bearer token',
          'X-Custom': 'value'
        }
      };

      const factory = createTransportFactory('test-server', spec, mockLogger);
      await factory();

      const { StreamableHTTPClientTransport } = await import('@modelcontextprotocol/sdk/client/streamableHttp.js');
      const call = (StreamableHTTPClientTransport as MockedFunction<typeof StreamableHTTPClientTransport>).mock.calls[0];

      expect(call[1]).toEqual(
        expect.objectContaining({
          fetch: expect.any(Function)
        })
      );
    });

    it('should pass headers to fetch wrapper for SSE transport', async () => {
      const spec: ServerSpec = {
        url: 'https://api.example.com/mcp',
        type: 'sse',
        headers: {
          Authorization: 'Bearer token'
        }
      };

      const factory = createTransportFactory('test-server', spec, mockLogger);
      await factory();

      const { SSEClientTransport } = await import('@himorishige/hatago-transport');
      const call = (SSEClientTransport as MockedFunction<typeof SSEClientTransport>).mock.calls[0];

      expect(call[1]).toEqual(
        expect.objectContaining({
          fetch: expect.any(Function)
        })
      );
    });
  });
});
