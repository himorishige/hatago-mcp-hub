import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SSEManager } from './sse-manager.js';
import type { Logger } from './logger.js';

describe('SSEManager', () => {
  let mockLogger: Logger;
  let manager: SSEManager;
  let mockWriter: WritableStreamDefaultWriter;

  beforeEach(() => {
    vi.useFakeTimers();

    // Create mock logger
    mockLogger = {
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn()
    } as unknown as Logger;

    // Create mock writer
    mockWriter = {
      write: vi.fn().mockResolvedValue(undefined),
      close: vi.fn().mockResolvedValue(undefined),
      abort: vi.fn().mockResolvedValue(undefined),
      ready: Promise.resolve(),
      closed: Promise.resolve(),
      desiredSize: 1,
      releaseLock: vi.fn()
    } as unknown as WritableStreamDefaultWriter;

    manager = new SSEManager(mockLogger);
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.restoreAllMocks();
  });

  describe('Client management', () => {
    it('should add a new client', async () => {
      manager.addClient('client1', mockWriter);

      expect(manager.isClientConnected('client1')).toBe(true);
      expect(manager.getClientCount()).toBe(1);

      // Should send initial connection event
      expect(mockWriter.write).toHaveBeenCalled();
      const call = (mockWriter.write as any).mock.calls[0][0];
      const message = new TextDecoder().decode(call);
      expect(message).toContain('event: connected');
    });

    it('should remove a client', () => {
      manager.addClient('client1', mockWriter);
      manager.removeClient('client1');

      expect(manager.isClientConnected('client1')).toBe(false);
      expect(manager.getClientCount()).toBe(0);
    });

    it('should handle multiple clients', () => {
      const writer1 = { ...mockWriter };
      const writer2 = { ...mockWriter };

      manager.addClient('client1', writer1);
      manager.addClient('client2', writer2);

      expect(manager.getClientCount()).toBe(2);
      expect(manager.isClientConnected('client1')).toBe(true);
      expect(manager.isClientConnected('client2')).toBe(true);

      manager.removeClient('client1');
      expect(manager.getClientCount()).toBe(1);
      expect(manager.isClientConnected('client1')).toBe(false);
      expect(manager.isClientConnected('client2')).toBe(true);
    });

    it('should clear keepalive interval on removal', () => {
      const clearIntervalSpy = vi.spyOn(global, 'clearInterval');

      manager.addClient('client1', mockWriter);
      manager.removeClient('client1');

      expect(clearIntervalSpy).toHaveBeenCalled();
    });
  });

  describe('Progress token management', () => {
    beforeEach(() => {
      manager.addClient('client1', mockWriter);
    });

    it('should register progress token', () => {
      manager.registerProgressToken('token1', 'client1');

      expect(mockLogger.debug).toHaveBeenCalledWith('[SSE] Progress token registered', {
        progressToken: 'token1',
        clientId: 'client1'
      });
    });

    it('should unregister progress token', () => {
      manager.registerProgressToken('token1', 'client1');
      manager.unregisterProgressToken('token1');

      expect(mockLogger.debug).toHaveBeenCalledWith('[SSE] Progress token unregistered', {
        progressToken: 'token1'
      });
    });

    it('should clean up progress tokens when client is removed', () => {
      manager.registerProgressToken('token1', 'client1');
      manager.registerProgressToken('token2', 'client1');
      manager.registerProgressToken('token3', 'client2');

      manager.removeClient('client1');

      // token3 should still be routed to client2
      manager.sendProgress('token3', {
        progressToken: 'token3',
        progress: 50,
        message: 'Test'
      });

      // token1 and token2 should not route to any client
      manager.sendProgress('token1', {
        progressToken: 'token1',
        progress: 50
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('[SSE] No client found for progress token', {
        progressToken: 'token1'
      });
    });
  });

  describe('Progress notifications', () => {
    beforeEach(() => {
      manager.addClient('client1', mockWriter);
      // Reset mock to clear initial connection event
      vi.clearAllMocks();
    });

    it('should send progress notification to registered client', async () => {
      manager.registerProgressToken('token1', 'client1');

      const progress = {
        progressToken: 'token1',
        progress: 50,
        total: 100,
        message: 'Processing...',
        serverId: 'server1'
      };

      manager.sendProgress('token1', progress);

      // Use process.nextTick for async operations
      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockWriter.write).toHaveBeenCalled();
      const call = (mockWriter.write as any).mock.calls[0][0];
      const message = new TextDecoder().decode(call);
      expect(message).toContain('event: progress');
      expect(message).toContain(JSON.stringify(progress));
    });

    it('should warn when no client found for progress token', () => {
      manager.sendProgress('unknown-token', {
        progressToken: 'unknown-token',
        progress: 50
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('[SSE] No client found for progress token', {
        progressToken: 'unknown-token'
      });
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast to all clients', async () => {
      const writer1 = { ...mockWriter, write: vi.fn().mockResolvedValue(undefined) };
      const writer2 = { ...mockWriter, write: vi.fn().mockResolvedValue(undefined) };

      manager.addClient('client1', writer1);
      manager.addClient('client2', writer2);

      await manager.broadcast('announcement', { message: 'Hello everyone' });

      expect(writer1.write).toHaveBeenCalledTimes(2); // connection + broadcast
      expect(writer2.write).toHaveBeenCalledTimes(2); // connection + broadcast

      // Check broadcast message
      const call1 = writer1.write.mock.calls[1][0];
      const message1 = new TextDecoder().decode(call1);
      expect(message1).toContain('event: announcement');
      expect(message1).toContain('Hello everyone');
    });

    it('should handle broadcast when client fails', async () => {
      const failingWriter = {
        ...mockWriter,
        write: vi.fn().mockRejectedValue(new Error('Write failed'))
      };
      const workingWriter = {
        ...mockWriter,
        write: vi.fn().mockResolvedValue(undefined)
      };

      manager.addClient('failing', failingWriter);
      manager.addClient('working', workingWriter);

      await manager.broadcast('test', { data: 'test' });

      // Working client should still receive the message
      expect(workingWriter.write).toHaveBeenCalled();

      // Failing client should be removed
      expect(manager.isClientConnected('failing')).toBe(false);
      expect(manager.isClientConnected('working')).toBe(true);
    });
  });

  describe('Keep-alive', () => {
    it('should send keep-alive to all clients', async () => {
      const writer1 = { ...mockWriter, write: vi.fn().mockResolvedValue(undefined) };
      const writer2 = { ...mockWriter, write: vi.fn().mockResolvedValue(undefined) };

      manager.addClient('client1', writer1);
      manager.addClient('client2', writer2);

      // Clear initial connection events
      writer1.write.mockClear();
      writer2.write.mockClear();

      await manager.sendKeepAlive();

      expect(writer1.write).toHaveBeenCalled();
      expect(writer2.write).toHaveBeenCalled();

      const call1 = writer1.write.mock.calls[0][0];
      const message1 = new TextDecoder().decode(call1);
      expect(message1).toBe(':keepalive\n\n');
    });

    it('should automatically send keep-alive every 30 seconds', async () => {
      manager.addClient('client1', mockWriter);

      // Clear initial connection event
      vi.clearAllMocks();

      // Advance time by 30 seconds
      vi.advanceTimersByTime(30000);

      // Just wait for next tick
      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockWriter.write).toHaveBeenCalled();
      const call = (mockWriter.write as any).mock.calls[0][0];
      const message = new TextDecoder().decode(call);
      expect(message).toBe(':keepalive\n\n');
    });

    it('should handle framework-specific streams', async () => {
      const frameworkStream = {
        writeSSE: vi.fn()
      };

      manager.addClient('client1', mockWriter, frameworkStream);

      // Clear initial connection event
      vi.clearAllMocks();

      await manager.sendKeepAlive();

      expect(frameworkStream.writeSSE).toHaveBeenCalledWith({ comment: 'keepalive' });
    });

    it('should remove client on keep-alive failure', async () => {
      const failingWriter = {
        ...mockWriter,
        write: vi
          .fn()
          .mockResolvedValueOnce(undefined) // Initial connection succeeds
          .mockRejectedValueOnce(new Error('Connection lost')) // Keep-alive fails
      };

      manager.addClient('client1', failingWriter);
      expect(manager.isClientConnected('client1')).toBe(true);

      await manager.sendKeepAlive();

      expect(manager.isClientConnected('client1')).toBe(false);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        '[SSE] Keep-alive failed',
        expect.objectContaining({ clientId: 'client1' })
      );
    });
  });

  describe('Error handling', () => {
    it('should handle write errors gracefully', async () => {
      const failingWriter = {
        ...mockWriter,
        write: vi.fn().mockRejectedValue(new Error('Write error'))
      };

      manager.addClient('client1', failingWriter);

      // Clear logs from addClient
      vi.clearAllMocks();

      manager.registerProgressToken('token1', 'client1');
      manager.sendProgress('token1', {
        progressToken: 'token1',
        progress: 50
      });

      // Wait for async error handling to complete
      await new Promise((resolve) => process.nextTick(resolve));

      expect(mockLogger.error).toHaveBeenCalledWith(
        '[SSE] Failed to send event',
        expect.objectContaining({
          clientId: 'client1',
          event: 'progress',
          error: 'Write error'
        })
      );

      // Client should be removed after error
      expect(manager.isClientConnected('client1')).toBe(false);
    });

    it('should handle operations on non-existent clients', async () => {
      // Register progress token for a client that doesn't exist
      manager.registerProgressToken('token1', 'non-existent-client');

      // Try to send progress to non-existent client
      manager.sendProgress('token1', {
        progressToken: 'token1',
        progress: 50
      });

      // Wait for async operations
      await new Promise((resolve) => process.nextTick(resolve));

      // Should not throw, just handle gracefully
      // The sendToClient method checks if client exists
      expect(manager.getClientCount()).toBe(0);
    });
  });
});
