/**
 * HTTP/SSE MCP Connector Service
 * 
 * Isolated service for managing connections to remote MCP servers.
 * This separation helps avoid the 6 concurrent connection limit
 * by distributing connections across multiple service bindings.
 */

import type { Env } from './types.js';

interface ConnectorRequest {
  serverId: string;
  method: string;
  params?: any;
  progressToken?: string;
}

interface ServerConfig {
  url: string;
  type: 'http' | 'sse';
  headers?: Record<string, string>;
  timeout?: number;
}

export default {
  async fetch(
    request: Request,
    env: Env,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    
    // Handle different connector operations
    switch (url.pathname) {
      case '/connect':
        return handleConnect(request, env);
      case '/call':
        return handleCall(request, env);
      case '/stream':
        return handleStream(request, env);
      case '/disconnect':
        return handleDisconnect(request, env);
      default:
        return new Response('Not found', { status: 404 });
    }
  },
};

/**
 * Establish connection to MCP server
 */
async function handleConnect(request: Request, env: Env): Promise<Response> {
  const config: ServerConfig = await request.json();
  
  try {
    // Test connection
    const testResponse = await fetch(new URL('/health', config.url), {
      method: 'GET',
      headers: config.headers,
      signal: AbortSignal.timeout(config.timeout || 5000),
    });
    
    if (!testResponse.ok) {
      throw new Error(`Server returned ${testResponse.status}`);
    }
    
    return new Response(JSON.stringify({
      status: 'connected',
      serverId: crypto.randomUUID(),
    }), {
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      status: 'error',
      error: error instanceof Error ? error.message : 'Connection failed',
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Call MCP method with streaming support
 */
async function handleCall(request: Request, env: Env): Promise<Response> {
  const { serverId, method, params, progressToken }: ConnectorRequest = await request.json();
  
  // Get server config from KV
  const serverConfig = await env.CONFIG_KV.get<ServerConfig>(`server:${serverId}`, 'json');
  if (!serverConfig) {
    return new Response('Server not found', { status: 404 });
  }
  
  // Create request body
  const requestBody = {
    jsonrpc: '2.0',
    id: crypto.randomUUID(),
    method,
    params: {
      ...params,
      _meta: progressToken ? { progressToken } : undefined,
    },
  };
  
  try {
    // Make request to MCP server
    const response = await fetch(new URL('/mcp', serverConfig.url), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...serverConfig.headers,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(serverConfig.timeout || 30000),
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}`);
    }
    
    // Stream response back
    return new Response(response.body, {
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/json',
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : 'Request failed',
      },
      id: null,
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Handle SSE streaming from MCP server
 */
async function handleStream(request: Request, env: Env): Promise<Response> {
  const { serverId }: { serverId: string } = await request.json();
  
  // Get server config from KV
  const serverConfig = await env.CONFIG_KV.get<ServerConfig>(`server:${serverId}`, 'json');
  if (!serverConfig) {
    return new Response('Server not found', { status: 404 });
  }
  
  if (serverConfig.type !== 'sse') {
    return new Response('Server does not support SSE', { status: 400 });
  }
  
  // Create SSE connection
  const eventSource = new URL('/events', serverConfig.url);
  
  // Create readable stream for SSE forwarding
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      
      try {
        const response = await fetch(eventSource, {
          headers: {
            'Accept': 'text/event-stream',
            ...serverConfig.headers,
          },
        });
        
        if (!response.ok) {
          throw new Error(`Server returned ${response.status}`);
        }
        
        const reader = response.body!.getReader();
        
        // Forward SSE data with backpressure handling
        while (true) {
          const { done, value } = await reader.read();
          
          if (done) {
            controller.close();
            break;
          }
          
          // Forward chunk
          controller.enqueue(value);
        }
      } catch (error) {
        controller.error(error);
      }
    },
  });
  
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}

/**
 * Disconnect from MCP server
 */
async function handleDisconnect(request: Request, env: Env): Promise<Response> {
  const { serverId }: { serverId: string } = await request.json();
  
  // Clean up any server-specific resources
  await env.CONFIG_KV.delete(`server:${serverId}`);
  
  return new Response(JSON.stringify({
    status: 'disconnected',
    serverId,
  }), {
    headers: { 'Content-Type': 'application/json' },
  });
}