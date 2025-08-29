/**
 * STDIO Mode Implementation
 * 
 * Implements MCP protocol over STDIO with LSP-style framing.
 * This is the preferred mode for Claude Code integration.
 */

import { createHub } from '@hatago/hub/node';
import type { HatagoHub } from '@hatago/hub';
import type { Logger } from './logger.js';
import { once } from 'node:events';

/**
 * Start the MCP server in STDIO mode
 */
export async function startStdio(config: any, logger: Logger): Promise<void> {
  // Ensure stdout is for protocol only
  process.stdout.setDefaultEncoding('utf8');
  
  // Create hub instance
  const hub = createHub({ configFile: config.path });
  await hub.start();
  
  logger.info('Hatago MCP Hub started in STDIO mode');
  
  // Setup graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await hub.stop();
    process.exit(0);
  };
  
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  
  // Handle STDIO input with proper buffering
  let buffer = Buffer.alloc(0);
  let contentLength = -1;
  
  process.stdin.on('data', async (chunk: Buffer) => {
    // Append new data to buffer
    buffer = Buffer.concat([buffer, chunk]);
    
    while (true) {
      if (contentLength === -1) {
        // Look for Content-Length header
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;
        
        const header = buffer.slice(0, headerEnd).toString();
        const match = header.match(/Content-Length:\s*(\d+)/i);
        
        if (!match) {
          logger.error('Invalid header: missing Content-Length');
          // Reset buffer on error
          buffer = Buffer.alloc(0);
          break;
        }
        
        contentLength = parseInt(match[1], 10);
        // Remove header from buffer
        buffer = buffer.slice(headerEnd + 4);
      }
      
      // Check if we have the full message
      if (buffer.length < contentLength) break;
      
      // Extract message
      const messageData = buffer.slice(0, contentLength);
      buffer = buffer.slice(contentLength);
      
      contentLength = -1;
      
      try {
        const message = JSON.parse(messageData.toString());
        logger.debug('Received:', message);
        
        // Process message through hub
        const response = await processMessage(hub, message);
        
        if (response) {
          await sendMessage(response, logger);
        }
      } catch (error) {
        logger.error('Failed to process message:', error);
        
        // Try to extract ID from original message for error response
        let messageId = null;
        try {
          const originalMessage = JSON.parse(messageData.toString());
          messageId = originalMessage.id;
        } catch {}
        
        await sendMessage({
          jsonrpc: '2.0',
          error: {
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error)
          },
          id: messageId
        }, logger);
      }
    }
  });
  
  // Handle stdin errors
  process.stdin.on('error', (error) => {
    if ((error as any).code === 'EPIPE') {
      logger.info('STDIN pipe closed');
    } else {
      logger.error('STDIN error:', error);
    }
    shutdown('STDIN_ERROR');
  });
  
  process.stdin.on('end', () => {
    logger.info('STDIN closed, shutting down...');
    shutdown('STDIN_CLOSE');
  });
  
  // Start reading
  process.stdin.resume();
}

/**
 * Send a message over STDIO with LSP framing
 */
async function sendMessage(message: any, logger: Logger): Promise<void> {
  const body = JSON.stringify(message);
  const contentLength = Buffer.byteLength(body, 'utf8');
  const header = `Content-Length: ${contentLength}\r\n\r\n`;
  
  logger.debug('Sending:', message);
  
  try {
    // Write header with backpressure handling
    if (!process.stdout.write(header)) {
      await once(process.stdout, 'drain');
    }
    
    // Write body with backpressure handling
    if (!process.stdout.write(body)) {
      await once(process.stdout, 'drain');
    }
  } catch (error) {
    if ((error as any).code === 'EPIPE') {
      logger.info('STDOUT pipe closed');
      process.exit(0);
    } else {
      logger.error('Failed to send message:', error);
    }
  }
}

/**
 * Process incoming MCP message
 */
async function processMessage(hub: HatagoHub, message: any): Promise<any> {
  const { method, params, id } = message;
  
  try {
    // Handle different MCP methods
    switch (method) {
      case 'initialize':
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {}
            },
            serverInfo: {
              name: 'hatago-hub',
              version: '0.1.0'
            }
          }
        };
        
      case 'notifications/initialized':
        // This is a notification, no response needed
        return null;
        
      case 'tools/list':
        const tools = await hub.listTools();
        return {
          jsonrpc: '2.0',
          id,
          result: { tools }
        };
        
      case 'tools/call':
        const result = await hub.callTool({
          name: params.name,
          arguments: params.arguments,
          progressToken: params._meta?.progressToken
        });
        return {
          jsonrpc: '2.0',
          id,
          result
        };
        
      case 'resources/list':
        const resources = await hub.listResources();
        return {
          jsonrpc: '2.0',
          id,
          result: { resources }
        };
        
      case 'resources/read':
        const content = await hub.readResource(params.uri);
        return {
          jsonrpc: '2.0',
          id,
          result: content
        };
        
      case 'prompts/list':
        const prompts = await hub.listPrompts();
        return {
          jsonrpc: '2.0',
          id,
          result: { prompts }
        };
        
      case 'prompts/get':
        const prompt = await hub.getPrompt(params.name, params.arguments);
        return {
          jsonrpc: '2.0',
          id,
          result: prompt
        };
        
      default:
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32601,
            message: 'Method not found',
            data: { method }
          }
        };
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: 'Internal error',
        data: error instanceof Error ? error.message : String(error)
      }
    };
  }
}