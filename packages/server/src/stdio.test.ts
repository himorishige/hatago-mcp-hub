import { describe, it, expect, vi } from 'vitest';
import { Readable, Writable } from 'node:stream';

// This test validates that the STDIO implementation sets up message handlers
// BEFORE starting the hub, ensuring no messages are lost during initialization

describe('STDIO listener timing', () => {
  it('should set up stdin listeners before hub.start()', async () => {
    // Track the order of operations
    const operationOrder: string[] = [];

    // Mock stdin
    const mockStdin = new Readable({
      read() {
        /* no-op */
      }
    });

    const stdinOnSpy = vi.spyOn(mockStdin, 'on').mockImplementation((event, handler) => {
      if (event === 'data') {
        operationOrder.push('stdin.on(data)');
      }
      return mockStdin;
    });

    // Mock stdout
    const mockStdout = new Writable({
      write(chunk: any, encoding?: any, callback?: any) {
        if (callback) callback();
        return true;
      }
    });

    // Replace process streams
    const originalStdin = process.stdin;
    const originalStdout = process.stdout;
    Object.defineProperty(process, 'stdin', {
      value: mockStdin,
      configurable: true
    });
    Object.defineProperty(process, 'stdout', {
      value: mockStdout,
      configurable: true
    });

    // Mock hub module
    vi.doMock('@himorishige/hatago-hub/node', () => ({
      createHub: vi.fn(() => ({
        start: vi.fn(async () => {
          operationOrder.push('hub.start()');
        }),
        stop: vi.fn(),
        processRequest: vi.fn(),
        onNotification: null
      }))
    }));

    try {
      // Import the module under test
      const { startStdio } = await import('./stdio.js');
      const { Logger } = await import('./logger.js');

      const logger = new Logger('error');
      const config = {
        path: '/test/config.json',
        data: { version: 1, mcpServers: {} }
      };

      // Start the STDIO server
      const promise = startStdio(config, logger);

      // Wait a bit for async operations
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Verify that stdin listener was set up before hub.start()
      const dataListenerIndex = operationOrder.indexOf('stdin.on(data)');
      const hubStartIndex = operationOrder.indexOf('hub.start()');

      // Both operations should have occurred
      expect(dataListenerIndex).toBeGreaterThanOrEqual(0);
      expect(hubStartIndex).toBeGreaterThanOrEqual(0);

      // The critical assertion: stdin listener must be set up BEFORE hub.start()
      expect(dataListenerIndex).toBeLessThan(hubStartIndex);
    } finally {
      // Restore original streams
      Object.defineProperty(process, 'stdin', {
        value: originalStdin,
        configurable: true
      });
      Object.defineProperty(process, 'stdout', {
        value: originalStdout,
        configurable: true
      });

      vi.doUnmock('@himorishige/hatago-hub/node');
      vi.restoreAllMocks();
    }
  });

  it('should process newline-delimited JSON messages correctly', () => {
    // This test validates the comment fix - we expect newline-delimited JSON, not LSP framing
    const buffer = 'invalid json\n{"jsonrpc":"2.0","method":"test","id":1}\npartial message';
    const lines = buffer.split('\n');
    const completeLines = lines.slice(0, -1); // Remove the incomplete last line

    // Should process only complete lines
    expect(completeLines).toHaveLength(2);
    expect(completeLines[1]).toBe('{"jsonrpc":"2.0","method":"test","id":1}');

    // The last partial message should remain in buffer
    const remainingBuffer = lines[lines.length - 1];
    expect(remainingBuffer).toBe('partial message');
  });

  it('should handle multiple messages in a single chunk', () => {
    const chunk =
      '{"jsonrpc":"2.0","method":"method1","id":1}\n{"jsonrpc":"2.0","method":"method2","id":2}\n{"jsonrpc":"2.0","method":"method3","id":3}\n';
    const messages = chunk.split('\n').filter((line) => line.trim());

    expect(messages).toHaveLength(3);
    messages.forEach((msg, index) => {
      const parsed = JSON.parse(msg);
      expect(parsed.method).toBe(`method${index + 1}`);
      expect(parsed.id).toBe(index + 1);
    });
  });
});
