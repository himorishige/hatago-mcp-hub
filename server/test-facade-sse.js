#!/usr/bin/env node

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { MCPClientFacade } from './dist/mcp-hub-BistnOHv.js';

async function testFacadeSSE() {
  try {
    console.log('Testing MCPClientFacade with SSE...');
    
    const facade = new MCPClientFacade({
      name: 'test-client',
      version: '1.0.0',
      initializerOptions: {
        isFirstRun: false,
        timeouts: {
          normalMs: 30000,
        },
        debug: true,
      },
      debug: true,
    });
    
    const transport = new SSEClientTransport(
      new URL('https://docs.mcp.cloudflare.com/sse')
    );
    
    console.log('Connecting with facade...');
    const protocol = await facade.connect(transport);
    console.log('✅ Connected with protocol:', protocol);
    
    const client = facade.getClient();
    const tools = await client.listTools();
    console.log(`Tools: ${tools.tools.length}`);
    
    await facade.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testFacadeSSE();