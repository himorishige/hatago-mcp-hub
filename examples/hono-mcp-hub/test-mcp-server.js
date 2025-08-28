#!/usr/bin/env node
/**
 * Simple test MCP server for example
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const server = new Server({
  name: 'test-mcp-server',
  version: '1.0.0'
}, {
  capabilities: {
    tools: {},
    resources: {}
  }
});

// Register test tools
server.setRequestHandler('tools/list', async () => {
  return {
    tools: [
      {
        name: 'echo',
        description: 'Echo back the input message',
        inputSchema: {
          type: 'object',
          properties: {
            message: { 
              type: 'string',
              description: 'Message to echo back'
            }
          },
          required: ['message']
        }
      },
      {
        name: 'get_time',
        description: 'Get current time',
        inputSchema: {
          type: 'object',
          properties: {
            format: { 
              type: 'string',
              description: 'Time format (iso, unix, human)',
              enum: ['iso', 'unix', 'human']
            }
          }
        }
      },
      {
        name: 'random_number',
        description: 'Generate a random number',
        inputSchema: {
          type: 'object',
          properties: {
            min: { 
              type: 'number',
              description: 'Minimum value (default: 0)'
            },
            max: { 
              type: 'number',
              description: 'Maximum value (default: 100)'
            }
          }
        }
      }
    ]
  };
});

// Handle tool calls
server.setRequestHandler('tools/call', async (request) => {
  const { name, arguments: args } = request.params;
  
  switch (name) {
    case 'echo':
      return {
        content: [
          {
            type: 'text',
            text: `Echo: ${args.message}`
          }
        ]
      };
      
    case 'get_time':
      const now = new Date();
      let timeStr;
      switch (args.format || 'iso') {
        case 'unix':
          timeStr = String(Math.floor(now.getTime() / 1000));
          break;
        case 'human':
          timeStr = now.toLocaleString();
          break;
        case 'iso':
        default:
          timeStr = now.toISOString();
      }
      return {
        content: [
          {
            type: 'text',
            text: timeStr
          }
        ]
      };
      
    case 'random_number':
      const min = args.min ?? 0;
      const max = args.max ?? 100;
      const random = Math.floor(Math.random() * (max - min + 1)) + min;
      return {
        content: [
          {
            type: 'text',
            text: String(random)
          }
        ]
      };
      
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
});

// Register test resources
server.setRequestHandler('resources/list', async () => {
  return {
    resources: [
      {
        uri: 'test://readme',
        name: 'Test README',
        description: 'A test README resource',
        mimeType: 'text/plain'
      },
      {
        uri: 'test://config',
        name: 'Test Config',
        description: 'A test configuration resource',
        mimeType: 'application/json'
      }
    ]
  };
});

// Handle resource reads
server.setRequestHandler('resources/read', async (request) => {
  const { uri } = request.params;
  
  switch (uri) {
    case 'test://readme':
      return {
        contents: [
          {
            uri: 'test://readme',
            mimeType: 'text/plain',
            text: `# Test MCP Server

This is a test MCP server for the Hatago Example Hub.

## Features
- Echo tool
- Get time tool
- Random number generator

## Usage
This server is started automatically by the Hatago Example Hub.`
          }
        ]
      };
      
    case 'test://config':
      return {
        contents: [
          {
            uri: 'test://config',
            mimeType: 'application/json',
            text: JSON.stringify({
              name: 'test-mcp-server',
              version: '1.0.0',
              status: 'running',
              timestamp: new Date().toISOString()
            }, null, 2)
          }
        ]
      };
      
    default:
      throw new Error(`Unknown resource: ${uri}`);
  }
});

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  await transport.start();
  
  // Log to stderr so it doesn't interfere with stdio communication
  console.error('[Test MCP Server] Started successfully');
}

main().catch((error) => {
  console.error('[Test MCP Server] Failed to start:', error);
  process.exit(1);
});