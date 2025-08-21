/**
 * E2E test for remote MCP server connection
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { serve } from '@hono/node-server';
import type { Server } from 'node:http';
import mockApp from '../fixtures/mock-mcp-server.js';
import { RemoteMcpServer } from '../../src/servers/remote-mcp-server.js';
import type { RemoteServerConfig } from '../../src/config/types.js';

describe('Remote MCP Server E2E', () => {
  let mockServer: Server;
  let mockServerPort: number;
  
  beforeAll(async () => {
    // Start mock MCP server
    mockServerPort = 4001; // Use fixed port for testing
    mockServer = serve({
      fetch: mockApp.fetch,
      port: mockServerPort
    });
    
    // Wait for server to be ready
    await new Promise(resolve => setTimeout(resolve, 100));
  });
  
  afterAll(async () => {
    // Stop mock server
    await new Promise<void>((resolve) => {
      mockServer.close(() => resolve());
    });
  });
  
  it('should connect to local mock MCP server', async () => {
    const config: RemoteServerConfig = {
      id: 'test-remote',
      type: 'remote',
      url: `http://localhost:${mockServerPort}/mcp`,
      transport: 'http',
      start: 'lazy'
    };
    
    const server = new RemoteMcpServer(config);
    
    // Start the server
    await server.start();
    
    // Check state
    expect(server.getState()).toBe('running');
    
    // Get tools
    const tools = await server.getTools();
    expect(tools).toHaveLength(2);
    expect(tools[0].name).toBe('test_echo');
    expect(tools[1].name).toBe('test_math');
    
    // Get resources
    const resources = await server.getResources();
    expect(resources).toHaveLength(2);
    expect(resources[0].uri).toBe('test://config.json');
    
    // Get prompts
    const prompts = await server.getPrompts();
    expect(prompts).toHaveLength(1);
    expect(prompts[0].name).toBe('test_greeting');
    
    // Call a tool
    const result = await server.callTool('test_echo', { message: 'Hello World' });
    expect(result).toEqual({
      content: [
        {
          type: 'text',
          text: 'Echo: Hello World'
        }
      ]
    });
    
    // Call math tool
    const mathResult = await server.callTool('test_math', {
      operation: 'add',
      a: 10,
      b: 20
    });
    expect(mathResult).toEqual({
      content: [
        {
          type: 'text',
          text: 'Result: 30'
        }
      ]
    });
    
    // Stop the server
    await server.stop();
    expect(server.getState()).toBe('stopped');
  });
  
  it('should handle connection failures gracefully', async () => {
    const config: RemoteServerConfig = {
      id: 'test-fail',
      type: 'remote',
      url: 'http://localhost:9999/mcp', // Non-existent server
      transport: 'http',
      start: 'lazy',
      autoReconnect: false
    };
    
    const server = new RemoteMcpServer(config);
    
    // Should throw on connection failure
    await expect(server.start()).rejects.toThrow();
    
    // State should be crashed
    expect(server.getState()).toBe('crashed');
  });
  
  it('should support session management', async () => {
    const config: RemoteServerConfig = {
      id: 'test-session',
      type: 'remote',
      url: `http://localhost:${mockServerPort}/mcp`,
      transport: 'http',
      start: 'lazy'
    };
    
    const server1 = new RemoteMcpServer(config);
    const server2 = new RemoteMcpServer({
      ...config,
      id: 'test-session-2'
    });
    
    // Start both servers
    await server1.start();
    await server2.start();
    
    // Both should have their own sessions
    expect(server1.getState()).toBe('running');
    expect(server2.getState()).toBe('running');
    
    // Each should be able to call tools independently
    const result1 = await server1.callTool('test_echo', { message: 'Server 1' });
    const result2 = await server2.callTool('test_echo', { message: 'Server 2' });
    
    expect(result1).toEqual({
      content: [{ type: 'text', text: 'Echo: Server 1' }]
    });
    expect(result2).toEqual({
      content: [{ type: 'text', text: 'Echo: Server 2' }]
    });
    
    // Clean up
    await server1.stop();
    await server2.stop();
  });
});