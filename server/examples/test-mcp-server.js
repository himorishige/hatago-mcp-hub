#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const server = new McpServer({
  name: 'test-server',
  version: '1.0.0',
});

// Register a simple tool with Zod schema
server.registerTool(
  'test_hello',
  {
    title: 'Test Hello',
    description: 'A simple test tool',
    inputSchema: {
      name: z.string().describe('Name to greet')
    },
  },
  async (args) => {
    const { name = 'World' } = args;
    return {
      content: [
        {
          type: 'text',
          text: `Hello, ${name}!`,
        },
      ],
    };
  },
);

// Start the server
const transport = new StdioServerTransport();
await server.connect(transport);
// Don't output to stderr as it may interfere with MCP protocol
// console.error('Test MCP server started successfully');