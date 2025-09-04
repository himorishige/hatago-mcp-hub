#!/usr/bin/env node
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { serve } from '@hono/node-server';
import minimist from 'minimist';

interface Args {
  port?: string;
  echo?: boolean;
  stream?: boolean;
  slow?: boolean;
  fail?: boolean;
  resources?: boolean;
  sse?: boolean;
  _: string[];
  [key: string]: unknown;
}

const argv = minimist<Args>(process.argv.slice(2));

// Parse options
const port = parseInt(argv.port ?? '0', 10);
const features = {
  echo: argv.echo ?? true,
  stream: argv.stream ?? false,
  slow: argv.slow ?? false,
  fail: argv.fail ?? false,
  resources: argv.resources ?? false,
  sse: argv.sse ?? false
};

const app = new Hono();

// Enable CORS
app.use('*', cors());

// Health check
app.get('/health', (c) => {
  return c.json({ status: 'ok', features });
});

// MCP initialization/handshake
app.post('/initialize', async (c) => {
  const body = await c.req.json();

  return c.json({
    jsonrpc: '2.0',
    id: body.id,
    result: {
      protocolVersion: '2025-06-18',
      capabilities: {
        tools: {},
        resources: features.resources ? {} : undefined
      },
      serverInfo: {
        name: 'test-fixture-http',
        version: '1.0.0'
      }
    }
  });
});

// List tools
app.post('/tools/list', async (c) => {
  const body = await c.req.json();
  const tools = [];

  if (features.echo) {
    tools.push({
      name: 'echo',
      description: 'Echo the input text',
      inputSchema: {
        type: 'object',
        properties: {
          text: { type: 'string', description: 'Text to echo' }
        }
      }
    });
  }

  if (features.stream) {
    tools.push({
      name: 'stream_echo',
      description: 'Stream multiple chunks',
      inputSchema: {
        type: 'object',
        properties: {
          count: { type: 'number', description: 'Number of chunks' },
          text: { type: 'string', description: 'Text prefix' }
        }
      }
    });
  }

  if (features.slow) {
    tools.push({
      name: 'slow',
      description: 'Respond slowly',
      inputSchema: {
        type: 'object',
        properties: {
          delay: { type: 'number', description: 'Delay in ms' }
        }
      }
    });
  }

  if (features.fail) {
    tools.push({
      name: 'fail',
      description: 'Always fails',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'Error message' }
        }
      }
    });
  }

  return c.json({
    jsonrpc: '2.0',
    id: body.id,
    result: { tools }
  });
});

// Call tool
app.post('/tools/call', async (c) => {
  const body = await c.req.json();
  const { name, arguments: args = {} } = body.params;

  if (name === 'echo' && features.echo) {
    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        content: [
          {
            type: 'text',
            text: (args.text as string) ?? ''
          }
        ]
      }
    });
  }

  if (name === 'stream_echo' && features.stream) {
    const count = (args.count as number) ?? 3;
    const text = (args.text as string) ?? 'chunk';
    const chunks = [];

    for (let i = 0; i < count; i++) {
      chunks.push({
        type: 'text',
        text: `${text}-${i + 1}`
      });
    }

    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        content: chunks
      }
    });
  }

  if (name === 'slow' && features.slow) {
    const delay = (args.delay as number) ?? 1000;
    await new Promise((resolve) => setTimeout(resolve, delay));

    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
        content: [
          {
            type: 'text',
            text: `Delayed for ${delay}ms`
          }
        ]
      }
    });
  }

  if (name === 'fail' && features.fail) {
    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32603,
        message: (args.message as string) ?? 'Intentional failure'
      }
    });
  }

  return c.json({
    jsonrpc: '2.0',
    id: body.id,
    error: {
      code: -32601,
      message: `Unknown tool: ${name}`
    }
  });
});

// List resources
if (features.resources) {
  app.post('/resources/list', async (c) => {
    const body = await c.req.json();

    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      result: {
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
      }
    });
  });

  app.post('/resources/read', async (c) => {
    const body = await c.req.json();
    const { uri } = body.params;

    if (uri === 'test://example/file.txt') {
      return c.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: 'Hello from test fixture!'
            }
          ]
        }
      });
    }

    if (uri === 'test://example/data.json') {
      return c.json({
        jsonrpc: '2.0',
        id: body.id,
        result: {
          contents: [
            {
              uri,
              mimeType: 'application/json',
              text: JSON.stringify({ test: true, value: 42 })
            }
          ]
        }
      });
    }

    return c.json({
      jsonrpc: '2.0',
      id: body.id,
      error: {
        code: -32602,
        message: `Resource not found: ${uri}`
      }
    });
  });
}

// SSE endpoint
if (features.sse) {
  app.get('/events', (c) => {
    const stream = new ReadableStream({
      start(controller) {
        // Send initial ping
        controller.enqueue(`event: ping\ndata: {}\n\n`);

        // Keep connection alive
        const interval = setInterval(() => {
          controller.enqueue(`event: ping\ndata: {}\n\n`);
        }, 30000);

        // Clean up on close
        c.req.raw.signal.addEventListener('abort', () => {
          clearInterval(interval);
          controller.close();
        });
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive'
      }
    });
  });
}

// Start server
function main() {
  const server = serve({
    fetch: app.fetch,
    port: port || 0,
    hostname: '127.0.0.1'
  });

  // Get actual port
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  console.log(`Test fixture HTTP server running on port ${actualPort}`);

  // Handle shutdown
  process.on('SIGINT', () => {
    server.close(() => {
      process.exit(0);
    });
  });

  process.on('SIGTERM', () => {
    server.close(() => {
      process.exit(0);
    });
  });
}

try {
  main();
} catch (error) {
  console.error('Server error:', error);
  process.exit(1);
}
