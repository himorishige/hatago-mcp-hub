import { describe, expect, it } from 'vitest';
import 'reflect-metadata';
import { DecoratorServerNode, DecoratorTransport } from './adapter.js';
import { mcp, prompt, resource, tool } from './decorators.js';
import { ServerFactory } from './server-factory.js';

describe('MCP Decorators', () => {
  @mcp({
    name: 'Test Server',
    version: '1.0.0',
    description: 'A test server using decorators',
  })
  class TestMCPServer {
    @tool({
      description: 'Greet a person by name',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        required: ['name'],
      },
    })
    async greet(args: { name: string }): Promise<string> {
      return `Hello, ${args.name}!`;
    }

    @tool({
      name: 'calculate_sum',
      description: 'Calculate the sum of two numbers',
    })
    async add(args: { a: number; b: number }): Promise<number> {
      return args.a + args.b;
    }

    @resource({
      uri: 'test://greeting.txt',
      name: 'Greeting File',
      description: 'A greeting message',
      mimeType: 'text/plain',
    })
    async getGreeting(): Promise<string> {
      return 'Welcome to the test server!';
    }

    @prompt({
      description: 'Generate a personalized greeting prompt',
      arguments: [
        { name: 'name', description: 'Person to greet', required: true },
        { name: 'style', description: 'Greeting style', required: false },
      ],
    })
    async greetingPrompt(args: { name: string; style?: string }): Promise<any> {
      const style = args.style || 'friendly';
      return {
        description: `A ${style} greeting for ${args.name}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: `Please give me a ${style} greeting for ${args.name}`,
            },
          },
        ],
      };
    }
  }

  describe('ServerFactory', () => {
    it('should create MCP server from decorated class', () => {
      const server = ServerFactory.create(TestMCPServer);

      expect(server.name).toBe('Test Server');
      expect(server.version).toBe('1.0.0');
      expect(server.description).toBe('A test server using decorators');
      expect(server.capabilities.tools).toBeDefined();
      expect(server.capabilities.resources).toBeDefined();
      expect(server.capabilities.prompts).toBeDefined();
    });

    it('should extract tools from decorated methods', () => {
      const server = ServerFactory.create(TestMCPServer);

      expect(server.tools).toHaveLength(2);

      const greetTool = server.tools.find((t) => t.name === 'greet');
      expect(greetTool).toBeDefined();
      expect(greetTool?.description).toBe('Greet a person by name');
      expect(greetTool?.inputSchema.properties).toHaveProperty('name');

      const sumTool = server.tools.find((t) => t.name === 'calculate_sum');
      expect(sumTool).toBeDefined();
      expect(sumTool?.description).toBe('Calculate the sum of two numbers');
    });

    it('should extract resources from decorated methods', () => {
      const server = ServerFactory.create(TestMCPServer);

      expect(server.resources).toHaveLength(1);

      const resource = server.resources[0];
      expect(resource.uri).toBe('test://greeting.txt');
      expect(resource.name).toBe('Greeting File');
      expect(resource.mimeType).toBe('text/plain');
    });

    it('should extract prompts from decorated methods', () => {
      const server = ServerFactory.create(TestMCPServer);

      expect(server.prompts).toHaveLength(1);

      const prompt = server.prompts[0];
      expect(prompt.name).toBe('greetingPrompt');
      expect(prompt.description).toBe(
        'Generate a personalized greeting prompt',
      );
      expect(prompt.arguments).toHaveLength(2);
      expect(prompt.arguments[0].name).toBe('name');
      expect(prompt.arguments[0].required).toBe(true);
    });

    it('should handle tool calls', async () => {
      const server = ServerFactory.create(TestMCPServer);

      const result = await server.callTool({
        method: 'tools/call',
        params: { name: 'greet', arguments: { name: 'World' } },
      });

      expect(result.content[0].text).toBe('Hello, World!');
    });

    it('should handle resource reads', async () => {
      const server = ServerFactory.create(TestMCPServer);

      const result = await server.readResource({
        method: 'resources/read',
        params: { uri: 'test://greeting.txt' },
      });

      expect(result.contents[0].text).toBe('Welcome to the test server!');
      expect(result.contents[0].mimeType).toBe('text/plain');
    });

    it('should handle prompt gets', async () => {
      const server = ServerFactory.create(TestMCPServer);

      const result = await server.getPrompt({
        method: 'prompts/get',
        params: {
          name: 'greetingPrompt',
          arguments: { name: 'Alice', style: 'formal' },
        },
      });

      expect(result.description).toBe('A formal greeting for Alice');
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content.text).toContain(
        'formal greeting for Alice',
      );
    });
  });

  describe('DecoratorTransport', () => {
    it('should create transport from decorated class', async () => {
      const transport = new DecoratorTransport({ server: TestMCPServer });

      await transport.connect();
      expect(transport.isConnected()).toBe(true);

      const initResult = await transport.send('initialize');
      expect(initResult.serverInfo.name).toBe('Test Server');

      const toolsResult = await transport.send('tools/list');
      expect(toolsResult.tools).toHaveLength(2);

      await transport.disconnect();
    });

    it('should handle tool calls through transport', async () => {
      const transport = new DecoratorTransport({ server: TestMCPServer });

      const result = await transport.send('tools/call', {
        name: 'calculate_sum',
        arguments: { a: 5, b: 3 },
      });

      expect(result.content[0].text).toBe('8');
    });
  });

  describe('DecoratorServerNode', () => {
    it('should create server node from decorated class', async () => {
      const node = new DecoratorServerNode('test-server', {
        server: TestMCPServer,
      });

      const serverInfo = await node.getServerInfo();
      expect(serverInfo.name).toBe('Test Server');

      const tools = await node.listTools();
      expect(tools).toHaveLength(2);

      const stats = node.getStats();
      expect(stats.type).toBe('decorator');
      expect(stats.tools).toBe(2);
      expect(stats.resources).toBe(1);
      expect(stats.prompts).toBe(1);
    });

    it('should call tools through server node', async () => {
      const node = new DecoratorServerNode('test-server', {
        server: TestMCPServer,
      });

      const result = await node.callTool('greet', { name: 'Test' });
      expect(result.content[0].text).toBe('Hello, Test!');
    });
  });

  describe('Error Handling', () => {
    it('should throw error for undecorated class', () => {
      class UnDecoratedServer {}

      expect(() => {
        ServerFactory.create(UnDecoratedServer);
      }).toThrow('Class UnDecoratedServer is not decorated with @mcp');
    });

    it('should handle missing tool handlers', async () => {
      @mcp({ name: 'Broken Server', version: '1.0.0' })
      class BrokenServer {}

      const server = ServerFactory.create(BrokenServer);

      await expect(
        server.callTool({
          method: 'tools/call',
          params: { name: 'nonexistent', arguments: {} },
        }),
      ).rejects.toThrow('Tool not found: nonexistent');
    });
  });
});
