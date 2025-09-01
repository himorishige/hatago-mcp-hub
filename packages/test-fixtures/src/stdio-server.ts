#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import minimist from 'minimist';

interface Args {
  echo?: boolean;
  stream?: boolean;
  slow?: boolean;
  fail?: boolean;
  resources?: boolean;
  _: string[];
  [key: string]: unknown;
}

const argv = minimist<Args>(process.argv.slice(2));

// Parse feature flags
const features = {
  echo: argv.echo ?? true,
  stream: argv.stream ?? false,
  slow: argv.slow ?? false,
  fail: argv.fail ?? false,
  resources: argv.resources ?? false
};

// Create MCP server
const server = new Server(
  {
    name: 'test-fixture-stdio',
    version: '1.0.0'
  },
  {
    capabilities: {
      tools: {},
      resources: features.resources ? {} : undefined
    }
  }
);

// Register unified tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const toolName = request.params.name;

  // Handle echo tools
  if (toolName === 'echo' && features.echo) {
    const { text = '' } = request.params.arguments as { text?: string };
    return {
      content: [
        {
          type: 'text',
          text: String(text)
        }
      ]
    };
  }

  if (toolName === 'echo_object' && features.echo) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(request.params.arguments)
        }
      ]
    };
  }

  // Handle stream tool
  if (toolName === 'stream_echo' && features.stream) {
    const { count = 3, text = 'chunk' } = request.params.arguments as {
      count?: number;
      text?: string;
    };

    // Stream responses
    const chunks = [];
    for (let i = 0; i < count; i++) {
      chunks.push({
        type: 'text' as const,
        text: `${text}-${i + 1}`
      });
    }

    return {
      content: chunks
    };
  }

  // Handle slow tool
  if (toolName === 'slow' && features.slow) {
    const { delay = 1000 } = request.params.arguments as { delay?: number };

    await new Promise((resolve) => setTimeout(resolve, delay));

    return {
      content: [
        {
          type: 'text',
          text: `Delayed for ${delay}ms`
        }
      ]
    };
  }

  // Handle fail tool
  if (toolName === 'fail' && features.fail) {
    const { message = 'Intentional failure' } = request.params.arguments as {
      message?: string;
    };

    throw new Error(message);
  }

  // Unknown tool
  throw new Error(`Unknown tool: ${toolName}`);
});

// List tools
server.setRequestHandler(ListToolsRequestSchema, () => {
  const tools = [];

  if (features.echo) {
    tools.push({
      name: 'echo',
      description: 'Echo the input text',
      inputSchema: z.object({
        text: z.string().describe('Text to echo')
      })
    });

    tools.push({
      name: 'echo_object',
      description: 'Echo the input as JSON',
      inputSchema: z.object({}).passthrough()
    });
  }

  if (features.stream) {
    tools.push({
      name: 'stream_echo',
      description: 'Stream multiple chunks',
      inputSchema: z.object({
        count: z.number().optional().describe('Number of chunks'),
        text: z.string().optional().describe('Text prefix')
      })
    });
  }

  if (features.slow) {
    tools.push({
      name: 'slow',
      description: 'Respond slowly',
      inputSchema: z.object({
        delay: z.number().optional().describe('Delay in ms')
      })
    });
  }

  if (features.fail) {
    tools.push({
      name: 'fail',
      description: 'Always fails',
      inputSchema: z.object({
        message: z.string().optional().describe('Error message')
      })
    });
  }

  return { tools };
});

// Register resources if enabled
if (features.resources) {
  server.setRequestHandler(ListResourcesRequestSchema, () => {
    return {
      resources: [
        {
          uri: 'test://example/file.txt',
          name: 'Example File',
          description: 'A test file resource',
          mimeType: 'text/plain'
        },
        {
          uri: 'test://example/data.json',
          name: 'Example JSON',
          description: 'A test JSON resource',
          mimeType: 'application/json'
        }
      ]
    };
  });

  server.setRequestHandler(ReadResourceRequestSchema, (request) => {
    const { uri } = request.params;

    if (uri === 'test://example/file.txt') {
      return {
        contents: [
          {
            uri,
            mimeType: 'text/plain',
            text: 'Hello from test fixture!'
          }
        ]
      };
    }

    if (uri === 'test://example/data.json') {
      return {
        contents: [
          {
            uri,
            mimeType: 'application/json',
            text: JSON.stringify({ test: true, value: 42 })
          }
        ]
      };
    }

    throw new Error(`Resource not found: ${uri}`);
  });
}

// Start server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Handle shutdown
  process.on('SIGINT', async () => {
    await server.close();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    await server.close();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Server error:', error);
  process.exit(1);
});
