import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { HatagoHub } from '../hub.js';
import { setPlatform, resetPlatform } from '@himorishige/hatago-runtime/platform';
import { createNodePlatform } from '@himorishige/hatago-runtime/platform/node';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

describe('E2E: Tools', () => {
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

  describe('Tool listing', () => {
    it('should list all available tools', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--echo', '--slow', '--fail']
        });

        const tools = hub.tools.list();

        // Should have all registered tools with server prefix
        expect(tools.some((t) => t.name === 'test__echo')).toBe(true);
        expect(tools.some((t) => t.name === 'test__echo_object')).toBe(true);
        expect(tools.some((t) => t.name === 'test__slow')).toBe(true);
        expect(tools.some((t) => t.name === 'test__fail')).toBe(true);

        // Check tool structure
        const echoTool = tools.find((t) => t.name === 'test__echo');
        expect(echoTool).toBeDefined();
        expect(echoTool?.description).toBe('Echo the input text');
        expect(echoTool?.inputSchema).toBeDefined();
      } finally {
        await hub.stop();
      }
    });

    it('should handle tool name collisions with prefixing', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('server1', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        await hub.addServer('server2', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        const tools = hub.tools.list();

        // Both servers have echo tool, should be prefixed differently
        expect(tools.some((t) => t.name === 'server1__echo')).toBe(true);
        expect(tools.some((t) => t.name === 'server2__echo')).toBe(true);

        // No unprefixed tools
        expect(tools.some((t) => t.name === 'echo')).toBe(false);
      } finally {
        await hub.stop();
      }
    });
  });

  describe('Tool execution', () => {
    it('should execute echo tool successfully', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        const result = await hub.tools.call('test__echo', { text: 'Hello, World!' });

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toBe('Hello, World!');
      } finally {
        await hub.stop();
      }
    });

    it('should execute echo_object tool with complex data', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        const testData = {
          string: 'test',
          number: 42,
          boolean: true,
          array: [1, 2, 3],
          nested: { key: 'value' }
        };

        const result = await hub.tools.call('test__echo_object', testData);

        expect(result.content).toHaveLength(1);
        expect(result.content[0].type).toBe('text');

        const returned = JSON.parse(result.content[0].text);
        expect(returned).toEqual(testData);
      } finally {
        await hub.stop();
      }
    });

    it('should handle slow tool execution', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--slow']
        });

        const startTime = Date.now();
        const result = await hub.tools.call('test__slow', { delay: 500 });
        const endTime = Date.now();

        expect(result.content[0].text).toBe('Delayed for 500ms');
        expect(endTime - startTime).toBeGreaterThanOrEqual(500);
      } finally {
        await hub.stop();
      }
    });

    it('should handle tool execution failure', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--fail']
        });

        const result = await hub.tools.call('test__fail', { message: 'Custom error message' });

        expect(result.isError).toBe(true);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Custom error message');
      } finally {
        await hub.stop();
      }
    });

    it('should handle unknown tool gracefully', async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--echo']
        });

        const result = await hub.tools.call('test__nonexistent', {});

        expect(result.isError).toBe(true);
        expect(result.content[0].type).toBe('text');
        expect(result.content[0].text).toContain('Tool not found');
      } finally {
        await hub.stop();
      }
    });
  });

  describe('Parallel tool execution', () => {
    it.skip('should handle multiple concurrent tool calls', { timeout: 20000 }, async () => {
      const hub = new HatagoHub({
        namingStrategy: 'prefix',
        separator: '__'
      });

      try {
        await hub.start();

        await hub.addServer('test', {
          command: 'node',
          args: [fixturePath, '--echo', '--slow']
        });

        // Execute multiple tools in parallel
        const promises = [
          hub.tools.call('test__echo', { text: 'call-1' }),
          hub.tools.call('test__echo', { text: 'call-2' }),
          hub.tools.call('test__slow', { delay: 100 }),
          hub.tools.call('test__echo', { text: 'call-3' })
        ];

        const results = await Promise.all(promises);

        // All calls should succeed
        expect(results).toHaveLength(4);
        expect(results[0].content[0].text).toBe('call-1');
        expect(results[1].content[0].text).toBe('call-2');
        expect(results[2].content[0].text).toBe('Delayed for 100ms');
        expect(results[3].content[0].text).toBe('call-3');
      } finally {
        await hub.stop();
      }
    });
  });
});
