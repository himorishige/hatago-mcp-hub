#!/usr/bin/env node
/**
 * Minimal MCP server example
 * Shows how to create a simple MCP server with one tool
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';

// Create MCP server
const server = new Server({
  name: 'minimal-mcp-example',
  version: '0.0.1',
});

// Register capabilities
server.registerCapabilities({
  tools: {},
});

// Define a simple tool
const tools = [
  {
    name: 'echo',
    description: 'Echo back the input message',
    inputSchema: {
      type: 'object',
      properties: {
        message: {
          type: 'string',
          description: 'Message to echo',
        },
      },
      required: ['message'],
    },
  },
];

// Handle tools/list
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return { tools };
});

// Handle tools/call
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  if (name === 'echo') {
    return {
      content: [
        {
          type: 'text',
          text: `Echo: ${args.message}`,
        },
      ],
    };
  }

  throw new Error(`Unknown tool: ${name}`);
});

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Minimal MCP server started');
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});