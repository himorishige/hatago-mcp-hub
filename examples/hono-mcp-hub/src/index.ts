#!/usr/bin/env node
/**
 * Simplified Hatago MCP Hub Example
 * Using @hatago/hub for minimal boilerplate
 */

import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { streamSSE } from 'hono/streaming';
import { createHub } from '@hatago/hub';
import { handleMCPEndpoint } from '@hatago/hub/hub-streamable';

async function main() {
  console.log('🏮 Starting Hatago Example Hub...');
  
  // Create Hatago Hub with config
  const configPath = process.env.HATAGO_CONFIG || './hatago-test.config.json';
  const hub = createHub({ configFile: configPath });
  
  // Initialize hub
  await hub.start();
  
  // Create Hono app
  const app = new Hono();

  // Middleware
  app.use('*', cors({
    origin: ['http://localhost:*', 'http://127.0.0.1:*'],
    credentials: true,
    allowHeaders: ['Content-Type', 'Accept', 'mcp-session-id']
  }));

  // Health check
  app.get('/health', c => 
    c.json({ 
      status: 'ok', 
      uptime: process.uptime() 
    })
  );

  // MCP endpoint - use StreamableHTTP handler
  app.all('/mcp', async c => {
    return await handleMCPEndpoint(hub, c);
  });
  
  // SSE endpoint for progress notifications
  app.get('/events', async c => {
    const clientId = c.req.query('clientId') || `client-${Date.now()}`;
    const sseManager = hub.getSSEManager();
    
    console.log(`📡 SSE client connected: ${clientId}`);
    
    return streamSSE(c, async (stream) => {
      // Register client with SSE manager
      sseManager.addClient(clientId, stream);
      
      // Keep connection alive
      const keepAliveInterval = setInterval(() => {
        try {
          stream.writeSSE({ comment: 'keepalive' });
        } catch (error) {
          console.error(`SSE keepalive error for ${clientId}:`, error);
          clearInterval(keepAliveInterval);
        }
      }, 30000); // Every 30 seconds
      
      // Clean up on disconnect
      stream.onAbort(() => {
        console.log(`📡 SSE client disconnected: ${clientId}`);
        clearInterval(keepAliveInterval);
        sseManager.removeClient(clientId);
      });
      
      // Keep stream open
      await new Promise(() => {}); // Never resolves, keeps connection open
    });
  });

  // Start HTTP server
  const port = Number(process.env.PORT || 8787);
  const hostname = process.env.HOST || '127.0.0.1';
  
  const server = serve({ 
    fetch: app.fetch, 
    port,
    hostname
  });

  console.log('');
  console.log('✅ Hatago Example Hub is running!');
  console.log(`🌐 Server: http://${hostname}:${port}`);
  console.log(`🔌 MCP endpoint: http://${hostname}:${port}/mcp`);
  console.log(`📡 SSE endpoint: http://${hostname}:${port}/events`);
  console.log(`📊 Health check: http://${hostname}:${port}/health`);
  console.log('');
  console.log('Press Ctrl+C to stop the server');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    console.log(`\n👋 Received ${signal}, shutting down gracefully...`);
    
    try {
      await hub.stop();
      server.close();
      console.log('✅ Shutdown complete');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// Start the server
main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});