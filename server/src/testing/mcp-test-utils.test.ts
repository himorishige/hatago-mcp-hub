import { describe, expect, it, vi } from 'vitest';
import {
  createTestEnvironment,
  MCPTestClient,
  MockMCPServer,
  runMCPTestSuite,
  type TestPromptCall,
  type TestResourceRead,
  type TestToolCall,
} from './mcp-test-utils.js';

describe('MCP Test Utilities', () => {
  describe('MockMCPServer', () => {
    it('should create server with default options', () => {
      const server = new MockMCPServer();

      expect(server.name).toBe('Mock MCP Server');
      expect(server.version).toBe('1.0.0');
      expect(server.getStats()).toEqual({
        tools: 0,
        resources: 0,
        prompts: 0,
        capabilities: {
          tools: true,
          resources: true,
          prompts: true,
          logging: false,
        },
      });
    });

    it('should create server with custom options', () => {
      const server = new MockMCPServer({
        name: 'Custom Test Server',
        version: '2.0.0',
        capabilities: {
          tools: true,
          resources: false,
          prompts: true,
          logging: true,
        },
      });

      expect(server.name).toBe('Custom Test Server');
      expect(server.version).toBe('2.0.0');
      expect(server.getStats().capabilities).toEqual({
        tools: true,
        resources: false,
        prompts: true,
        logging: true,
      });
    });

    it('should add tools with handlers', () => {
      const server = new MockMCPServer();
      const toolHandler = vi.fn().mockResolvedValue('Hello, World!');

      const tool = {
        name: 'greet',
        description: 'Greet someone',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string' },
          },
        },
      };

      server.addTool(tool, toolHandler);

      expect(server.getStats().tools).toBe(1);
    });

    it('should handle initialize request', async () => {
      const server = new MockMCPServer({
        name: 'Test Server',
        version: '1.0.0',
      });

      const response = await server.handleRequest('initialize', {});

      expect(response.serverInfo.name).toBe('Test Server');
      expect(response.serverInfo.version).toBe('1.0.0');
      expect(response.capabilities.tools).toBeDefined();
      expect(response.capabilities.resources).toBeDefined();
      expect(response.capabilities.prompts).toBeDefined();
    });

    it('should handle tools/list request', async () => {
      const server = new MockMCPServer();
      const handler = vi.fn().mockResolvedValue('test result');

      server.addTool(
        {
          name: 'test-tool',
          description: 'A test tool',
        },
        handler,
      );

      const response = await server.handleRequest('tools/list', {});

      expect(response.tools).toHaveLength(1);
      expect(response.tools[0].name).toBe('test-tool');
    });

    it('should handle tools/call request', async () => {
      const server = new MockMCPServer();
      const handler = vi.fn().mockResolvedValue('Hello, Alice!');

      server.addTool(
        {
          name: 'greet',
          description: 'Greet someone',
        },
        handler,
      );

      const response = await server.handleRequest('tools/call', {
        name: 'greet',
        arguments: { name: 'Alice' },
      });

      expect(handler).toHaveBeenCalledWith({ name: 'Alice' });
      expect(response.content[0].text).toBe('Hello, Alice!');
    });

    it('should handle resources/list and resources/read', async () => {
      const server = new MockMCPServer();
      const resourceHandler = vi.fn().mockResolvedValue('Resource content');

      server.addResource(
        {
          uri: 'test://resource',
          name: 'Test Resource',
          mimeType: 'text/plain',
        },
        resourceHandler,
      );

      const listResponse = await server.handleRequest('resources/list', {});
      expect(listResponse.resources).toHaveLength(1);

      const readResponse = await server.handleRequest('resources/read', {
        uri: 'test://resource',
      });
      expect(readResponse.contents[0].text).toBe('Resource content');
      expect(readResponse.contents[0].mimeType).toBe('text/plain');
    });

    it('should emit events for tool calls', async () => {
      const server = new MockMCPServer();
      const handler = vi.fn().mockResolvedValue('result');
      const eventSpy = vi.fn();

      server.on('tool-called', eventSpy);

      server.addTool({ name: 'test', description: 'test' }, handler);

      await server.handleRequest('tools/call', {
        name: 'test',
        arguments: { param: 'value' },
      });

      expect(eventSpy).toHaveBeenCalledWith({
        name: 'test',
        arguments: { param: 'value' },
        result: 'result',
      });
    });
  });

  describe('MCPTestClient', () => {
    it('should connect and disconnect from mock server', async () => {
      const server = new MockMCPServer();
      const client = new MCPTestClient(server);

      await client.connect();
      // Should not throw

      await client.disconnect();
      // Should not throw
    });

    it('should test tool calls with assertions', async () => {
      const server = new MockMCPServer();
      const client = new MCPTestClient(server);

      server.addTool(
        { name: 'add', description: 'Add numbers' },
        async (args) => args.a + args.b,
      );

      await client.connect();

      const toolTests: TestToolCall[] = [
        {
          name: 'add',
          arguments: { a: 2, b: 3 },
          expectedResult: (result: any) => {
            return result.content[0].text === '5';
          },
        },
      ];

      await client.testToolCalls(toolTests);

      await client.disconnect();
    });

    it('should test resource reads with assertions', async () => {
      const server = new MockMCPServer();
      const client = new MCPTestClient(server);

      server.addResource(
        { uri: 'test://file.txt', name: 'Test File', mimeType: 'text/plain' },
        async () => 'File content',
      );

      await client.connect();

      const resourceTests: TestResourceRead[] = [
        {
          uri: 'test://file.txt',
          expectedContent: (result: any) => {
            return result.contents[0].text === 'File content';
          },
        },
      ];

      await client.testResourceReads(resourceTests);

      await client.disconnect();
    });

    it('should handle expected errors', async () => {
      const server = new MockMCPServer();
      const client = new MCPTestClient(server);

      server.addTool(
        { name: 'error-tool', description: 'Always errors' },
        async () => {
          throw new Error('Tool error');
        },
      );

      await client.connect();

      const toolTests: TestToolCall[] = [
        {
          name: 'error-tool',
          arguments: {},
          expectedError: 'Tool error',
        },
      ];

      await client.testToolCalls(toolTests);

      await client.disconnect();
    });
  });

  describe('Helper Functions', () => {
    it('should create test environment', async () => {
      const { server, client } = await createTestEnvironment({
        name: 'Test Environment Server',
      });

      expect(server.name).toBe('Test Environment Server');
      expect(client).toBeInstanceOf(MCPTestClient);

      await client.disconnect();
    });

    it('should run complete test suite', async () => {
      const server = new MockMCPServer();

      // Add test tools
      server.addTool(
        { name: 'multiply', description: 'Multiply numbers' },
        async (args) => args.x * args.y,
      );

      server.addResource(
        {
          uri: 'test://config.json',
          name: 'Config',
          mimeType: 'application/json',
        },
        async () => '{"setting": "value"}',
      );

      server.addPrompt(
        { name: 'greeting', description: 'Generate greeting', arguments: [] },
        async (args) => ({
          description: 'A friendly greeting',
          messages: [
            {
              role: 'assistant',
              content: { type: 'text', text: `Hello ${args.name || 'there'}!` },
            },
          ],
        }),
      );

      const testSuite = {
        server,
        toolTests: [
          {
            name: 'multiply',
            arguments: { x: 4, y: 5 },
            expectedResult: (result: any) => result.content[0].text === '20',
          },
        ] as TestToolCall[],
        resourceTests: [
          {
            uri: 'test://config.json',
            expectedContent: (result: any) =>
              result.contents[0].text.includes('setting'),
          },
        ] as TestResourceRead[],
        promptTests: [
          {
            name: 'greeting',
            arguments: { name: 'World' },
            expectedPrompt: (result: any) =>
              result.messages[0].content.text.includes('World'),
          },
        ] as TestPromptCall[],
      };

      await runMCPTestSuite(testSuite);
      // Should complete without throwing
    });

    it('should handle test failures appropriately', async () => {
      const server = new MockMCPServer();

      server.addTool(
        { name: 'failing-tool', description: 'This will fail' },
        async () => 'unexpected result',
      );

      const testSuite = {
        server,
        toolTests: [
          {
            name: 'failing-tool',
            arguments: {},
            expectedResult: 'different result', // This will fail
          },
        ] as TestToolCall[],
      };

      await expect(runMCPTestSuite(testSuite)).rejects.toThrow();
    });
  });
});
