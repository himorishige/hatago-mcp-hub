/**
 * Tests for ProcessTransport
 */

import { spawn } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProcessTransport } from './process-transport.js';
import type { ProcessTransportOptions } from './types.js';

// Mock child_process
vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('ProcessTransport', () => {
  let transport: ProcessTransport;
  let mockProcess: any;

  beforeEach(() => {
    // Create mock process
    mockProcess = {
      stdin: {
        write: vi.fn((_data, callback) => {
          if (callback) callback();
        }),
      },
      stdout: {
        on: vi.fn(),
      },
      stderr: {
        on: vi.fn(),
      },
      on: vi.fn(),
      kill: vi.fn(),
    };

    // Mock spawn to return our mock process
    vi.mocked(spawn).mockReturnValue(mockProcess as any);

    const options: ProcessTransportOptions = {
      command: 'test-command',
      args: ['arg1', 'arg2'],
      env: { TEST_ENV: 'test' },
      cwd: '/test/dir',
    };

    transport = new ProcessTransport(options);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Constructor', () => {
    it('should create transport with options', () => {
      expect(transport).toBeInstanceOf(ProcessTransport);
    });
  });

  describe('Start', () => {
    it('should spawn process with correct arguments', async () => {
      await transport.start();

      expect(spawn).toHaveBeenCalledWith('test-command', ['arg1', 'arg2'], {
        env: expect.objectContaining({ TEST_ENV: 'test' }),
        cwd: '/test/dir',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    });

    it('should throw if already started', async () => {
      await transport.start();

      await expect(transport.start()).rejects.toThrow(
        'Transport already started',
      );
    });

    it('should register stdout handler', async () => {
      await transport.start();

      expect(mockProcess.stdout.on).toHaveBeenCalledWith(
        'data',
        expect.any(Function),
      );
    });

    it('should register stderr handler', async () => {
      await transport.start();

      expect(mockProcess.stderr.on).toHaveBeenCalledWith(
        'data',
        expect.any(Function),
      );
    });

    it('should register process error handler', async () => {
      await transport.start();

      expect(mockProcess.on).toHaveBeenCalledWith(
        'error',
        expect.any(Function),
      );
    });

    it('should register process exit handler', async () => {
      await transport.start();

      expect(mockProcess.on).toHaveBeenCalledWith('exit', expect.any(Function));
    });
  });

  describe('Send', () => {
    it('should send message as JSON with newline', async () => {
      await transport.start();

      const message = { type: 'test', data: 'hello' };
      await transport.send(message);

      expect(mockProcess.stdin.write).toHaveBeenCalledWith(
        `${JSON.stringify(message)}\n`,
        expect.any(Function),
      );
    });

    it('should throw if transport not started', async () => {
      await expect(transport.send({ test: 'data' })).rejects.toThrow(
        'Transport not started or stdin not available',
      );
    });

    it('should handle write errors', async () => {
      await transport.start();

      mockProcess.stdin.write.mockImplementation((_data, callback) => {
        if (callback) callback(new Error('Write failed'));
      });

      await expect(transport.send({ test: 'data' })).rejects.toThrow(
        'Write failed',
      );
    });
  });

  describe('Message Handling', () => {
    it('should parse and handle incoming messages', async () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      await transport.start();

      // Get the stdout data handler
      const stdoutHandler = mockProcess.stdout.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];

      // Simulate incoming data
      const message1 = { type: 'response', id: 1 };
      const message2 = { type: 'notification', method: 'test' };

      stdoutHandler?.(Buffer.from(`${JSON.stringify(message1)}\n`));
      stdoutHandler?.(Buffer.from(`${JSON.stringify(message2)}\n`));

      expect(messageHandler).toHaveBeenCalledTimes(2);
      expect(messageHandler).toHaveBeenNthCalledWith(1, message1);
      expect(messageHandler).toHaveBeenNthCalledWith(2, message2);
    });

    it('should handle partial messages', async () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      await transport.start();

      const stdoutHandler = mockProcess.stdout.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];

      // Send partial message
      const message = { type: 'test', data: 'partial' };
      const json = JSON.stringify(message);

      stdoutHandler?.(Buffer.from(json.slice(0, 10))); // First part
      expect(messageHandler).not.toHaveBeenCalled();

      stdoutHandler?.(Buffer.from(`${json.slice(10)}\n`)); // Rest with newline
      expect(messageHandler).toHaveBeenCalledWith(message);
    });

    it('should handle multiple messages in one chunk', async () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      await transport.start();

      const stdoutHandler = mockProcess.stdout.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];

      const message1 = { id: 1 };
      const message2 = { id: 2 };
      const combined = `${JSON.stringify(message1)}\n${JSON.stringify(message2)}\n`;

      stdoutHandler?.(Buffer.from(combined));

      expect(messageHandler).toHaveBeenCalledTimes(2);
      expect(messageHandler).toHaveBeenNthCalledWith(1, message1);
      expect(messageHandler).toHaveBeenNthCalledWith(2, message2);
    });

    it('should skip empty lines', async () => {
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      await transport.start();

      const stdoutHandler = mockProcess.stdout.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];

      stdoutHandler?.(Buffer.from(`\n\n${JSON.stringify({ test: 1 })}\n\n`));

      expect(messageHandler).toHaveBeenCalledTimes(1);
      expect(messageHandler).toHaveBeenCalledWith({ test: 1 });
    });

    it('should handle invalid JSON', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      const messageHandler = vi.fn();
      transport.onMessage(messageHandler);

      await transport.start();

      const stdoutHandler = mockProcess.stdout.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];

      stdoutHandler?.(Buffer.from('invalid json\n'));

      expect(messageHandler).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ProcessTransport] Failed to parse message:',
        expect.any(SyntaxError),
        'Line:',
        'invalid json',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Error Handling', () => {
    it('should handle process errors', async () => {
      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      await transport.start();

      const processErrorHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'error',
      )?.[1];

      const error = new Error('Process error');
      processErrorHandler?.(error);

      expect(errorHandler).toHaveBeenCalledWith(error);
    });

    it('should handle process exit with non-zero code', async () => {
      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      await transport.start();

      const exitHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'exit',
      )?.[1];

      exitHandler?.(1, null);

      expect(errorHandler).toHaveBeenCalledWith(
        new Error('Process exited with code 1, signal null'),
      );
    });

    it('should handle stderr output', async () => {
      const consoleErrorSpy = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {});

      await transport.start();

      const stderrHandler = mockProcess.stderr.on.mock.calls.find(
        (call) => call[0] === 'data',
      )?.[1];

      stderrHandler?.(Buffer.from('Error output'));

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[ProcessTransport] stderr: Error output',
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('Close', () => {
    it('should kill process when closing', async () => {
      await transport.start();
      await transport.close();

      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should handle close when not started', async () => {
      await expect(transport.close()).resolves.not.toThrow();
    });

    it('should clear internal state', async () => {
      await transport.start();
      expect(await transport.ready()).toBe(true);

      await transport.close();
      expect(await transport.ready()).toBe(false);
    });
  });

  describe('Ready', () => {
    it('should return false when not started', async () => {
      expect(await transport.ready()).toBe(false);
    });

    it('should return true when started', async () => {
      await transport.start();
      expect(await transport.ready()).toBe(true);
    });

    it('should return false after close', async () => {
      await transport.start();
      await transport.close();
      expect(await transport.ready()).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    it('should handle process with no stdin', async () => {
      mockProcess.stdin = undefined;
      await transport.start();

      await expect(transport.send({ test: 'data' })).rejects.toThrow(
        'Transport not started or stdin not available',
      );
    });

    it('should handle process exit with signal', async () => {
      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      await transport.start();

      const exitHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'exit',
      )?.[1];

      exitHandler?.(null, 'SIGTERM');

      expect(errorHandler).toHaveBeenCalledWith(
        new Error('Process exited with code null, signal SIGTERM'),
      );
    });

    it('should handle normal process exit', async () => {
      const errorHandler = vi.fn();
      transport.onError(errorHandler);

      await transport.start();

      const exitHandler = mockProcess.on.mock.calls.find(
        (call) => call[0] === 'exit',
      )?.[1];

      exitHandler?.(0, null);

      expect(errorHandler).not.toHaveBeenCalled();
    });
  });
});
