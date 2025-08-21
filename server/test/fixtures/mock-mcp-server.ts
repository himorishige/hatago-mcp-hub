/**
 * Mock MCP Server for testing HTTP transport
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { 
  JSONRPCRequest, 
  JSONRPCResponse,
  InitializeResult,
  ListToolsResult,
  ListResourcesResult,
  ListPromptsResult,
  CallToolResult
} from '@modelcontextprotocol/sdk/types.js';

const app = new Hono();

// Enable CORS for testing
app.use('*', cors());

// Session management
const sessions = new Map<string, { 
  initialized: boolean;
  createdAt: Date;
}>();

// Mock tools
const mockTools = [
  {
    name: 'test_echo',
    description: 'Echoes back the input',
    inputSchema: {
      type: 'object',
      properties: {
        message: { type: 'string' }
      },
      required: ['message']
    }
  },
  {
    name: 'test_math',
    description: 'Performs simple math operations',
    inputSchema: {
      type: 'object',
      properties: {
        operation: { type: 'string', enum: ['add', 'subtract', 'multiply', 'divide'] },
        a: { type: 'number' },
        b: { type: 'number' }
      },
      required: ['operation', 'a', 'b']
    }
  }
];

// Mock resources
const mockResources = [
  {
    uri: 'test://config.json',
    name: 'Test Configuration',
    description: 'Mock configuration file'
  },
  {
    uri: 'test://data.csv',
    name: 'Test Data',
    description: 'Mock CSV data'
  }
];

// Mock prompts
const mockPrompts = [
  {
    name: 'test_greeting',
    description: 'Generate a greeting message',
    arguments: [
      {
        name: 'name',
        description: 'The name to greet',
        required: true
      }
    ]
  }
];

// MCP endpoint
app.post('/mcp', async (c) => {
  const body = await c.req.json() as JSONRPCRequest | JSONRPCRequest[];
  const sessionId = c.req.header('mcp-session-id');
  
  // Handle batch requests
  const requests = Array.isArray(body) ? body : [body];
  const responses: JSONRPCResponse[] = [];
  
  for (const request of requests) {
    let response: JSONRPCResponse;
    
    switch (request.method) {
      case 'initialize': {
        // Generate new session ID
        const newSessionId = `mock-session-${Date.now()}`;
        sessions.set(newSessionId, {
          initialized: true,
          createdAt: new Date()
        });
        
        const result: InitializeResult = {
          protocolVersion: '1.0.0',
          serverInfo: {
            name: 'mock-mcp-server',
            version: '1.0.0'
          },
          capabilities: {
            tools: {},
            resources: {},
            prompts: {}
          }
        };
        
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
        
        // Set session ID header
        c.header('mcp-session-id', newSessionId);
        break;
      }
      
      case 'tools/list': {
        // Check session
        if (sessionId && !sessions.has(sessionId)) {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32001,
              message: 'Session not found'
            }
          };
        } else {
          const result: ListToolsResult = {
            tools: mockTools
          };
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result
          };
        }
        break;
      }
      
      case 'resources/list': {
        const result: ListResourcesResult = {
          resources: mockResources
        };
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
        break;
      }
      
      case 'prompts/list': {
        const result: ListPromptsResult = {
          prompts: mockPrompts
        };
        response = {
          jsonrpc: '2.0',
          id: request.id,
          result
        };
        break;
      }
      
      case 'tools/call': {
        const params = request.params as { name: string; arguments?: unknown };
        
        if (params.name === 'test_echo') {
          const args = params.arguments as { message: string };
          const result: CallToolResult = {
            content: [
              {
                type: 'text',
                text: `Echo: ${args.message}`
              }
            ]
          };
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result
          };
        } else if (params.name === 'test_math') {
          const args = params.arguments as { operation: string; a: number; b: number };
          let value: number;
          
          switch (args.operation) {
            case 'add':
              value = args.a + args.b;
              break;
            case 'subtract':
              value = args.a - args.b;
              break;
            case 'multiply':
              value = args.a * args.b;
              break;
            case 'divide':
              value = args.a / args.b;
              break;
            default:
              value = 0;
          }
          
          const result: CallToolResult = {
            content: [
              {
                type: 'text',
                text: `Result: ${value}`
              }
            ]
          };
          response = {
            jsonrpc: '2.0',
            id: request.id,
            result
          };
        } else {
          response = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32601,
              message: `Tool not found: ${params.name}`
            }
          };
        }
        break;
      }
      
      default:
        response = {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: `Method not found: ${request.method}`
          }
        };
    }
    
    responses.push(response);
  }
  
  // Return single response or batch
  return c.json(responses.length === 1 ? responses[0] : responses);
});

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', server: 'mock-mcp-server' });
});

// Cleanup old sessions periodically
setInterval(() => {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt.getTime() > timeout) {
      sessions.delete(id);
    }
  }
}, 60 * 1000); // Check every minute

export default app;