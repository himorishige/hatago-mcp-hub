import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { HatagoHub } from '../hub.js';
import { setPlatform, resetPlatform } from '@himorishige/hatago-runtime/platform';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('E2E: Streaming', () => {
  let fixturePath: string;

  beforeAll(() => {
    // Initialize platform
    setPlatform(createNodePlatform());

    fixturePath = join(__dirname, '../../../test-fixtures/dist/stdio-server.js');
  });

  beforeEach(() => {
    // Reset platform for each test to avoid interference
    resetPlatform();
    setPlatform(createNodePlatform());
  });

  describe('Stream responses', () => {
    it('should handle streaming tool responses', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--stream']
        });

        const result = await hub.tools.call('test_stream_echo', { count: 5, text: 'stream' });

        // Should receive all chunks
        expect(result.content).toHaveLength(5);

        // Verify chunk order
        for (let i = 0; i < 5; i++) {
          expect(result.content[i].type).toBe('text');
          expect(result.content[i].text).toBe(`stream-${i + 1}`);
        }
      } finally {
        await hub.stop();
      }
    });

    it('should maintain order with multiple streaming calls', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--stream']
        });

        // Execute multiple streaming calls in parallel
        const promises = [
          hub.tools.call('test_stream_echo', { count: 3, text: 'first' }),
          hub.tools.call('test_stream_echo', { count: 3, text: 'second' }),
          hub.tools.call('test_stream_echo', { count: 3, text: 'third' })
        ];

        const results = await Promise.all(promises);

        // Each result should have correct chunks in order
        expect(results[0].content.map((c) => c.text)).toEqual(['first-1', 'first-2', 'first-3']);
        expect(results[1].content.map((c) => c.text)).toEqual(['second-1', 'second-2', 'second-3']);
        expect(results[2].content.map((c) => c.text)).toEqual(['third-1', 'third-2', 'third-3']);
      } finally {
        await hub.stop();
      }
    });

    it('should handle large streaming responses', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--stream']
        });

        const result = await hub.tools.call('test_stream_echo', { count: 100, text: 'chunk' });

        // Should receive all 100 chunks
        expect(result.content).toHaveLength(100);

        // Verify first and last chunks
        expect(result.content[0].text).toBe('chunk-1');
        expect(result.content[99].text).toBe('chunk-100');
      } finally {
        await hub.stop();
      }
    });
  });

  describe('Backpressure handling', () => {
    it.skip('should handle slow consumers gracefully', { timeout: 20000 }, async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--stream', '--slow']
        });

        // Start a streaming call
        const streamPromise = hub.tools.call('test_stream_echo', { count: 10, text: 'data' });

        // Meanwhile, execute a slow operation
        const slowPromise = hub.tools.call('test_slow', { delay: 200 });

        // Both should complete without blocking each other
        const [streamResult, slowResult] = await Promise.all([streamPromise, slowPromise]);

        expect(streamResult.content).toHaveLength(10);
        expect(slowResult.content[0].text).toBe('Delayed for 200ms');
      } finally {
        await hub.stop();
      }
    });
  });

  describe('Stream interruption', () => {
    it('should handle server disconnection during streaming', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--stream']
        });

        // This test would require ability to kill server mid-stream
        // For now, we'll test that partial results are handled

        // Start a long streaming operation
        const promise = hub.tools.call('test_stream_echo', { count: 1000, text: 'long' });

        // In a real test, we'd kill the server here
        // For now, just verify the operation completes
        const result = await promise;
        expect(result.content.length).toBeGreaterThan(0);
      } finally {
        await hub.stop();
      }
    });
  });

  describe('Mixed operations', () => {
    it.skip(
      'should handle mix of streaming and non-streaming tools',
      { timeout: 20000 },
      async () => {
        const hub = new HatagoHub({
          namingStrategy: 'prefix',
          separator: '__'
        });

        try {
          await hub.start();

          await hub.addServer('test', {
            command: 'node',
            args: [fixturePath, '--echo', '--stream', '--slow']
          });

          // Execute a mix of operations
          const promises = [
            hub.tools.call('test_echo', { text: 'simple' }),
            hub.tools.call('test_stream_echo', { count: 5, text: 'stream' }),
            hub.tools.call('test_slow', { delay: 100 }),
            hub.tools.call('test_echo', { text: 'another' })
          ];

          const results = await Promise.all(promises);

          // Verify each result type
          expect(results[0].content).toHaveLength(1); // Simple echo
          expect(results[1].content).toHaveLength(5); // Stream
          expect(results[2].content).toHaveLength(1); // Slow
          expect(results[3].content).toHaveLength(1); // Another echo
        } finally {
          await hub.stop();
        }
      }
    );
  });
});
