#!/usr/bin/env node

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function testSSE() {
  try {
    // Test Cloudflare docs
    console.log('Testing Cloudflare docs SSE endpoint...');
    const cloudflareTransport = new SSEClientTransport(
      new URL('https://docs.mcp.cloudflare.com/sse')
    );
    
    const cloudflareClient = new Client({
      name: 'hatago-test',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    console.log('Connecting to Cloudflare...');
    await cloudflareClient.connect(cloudflareTransport);
    console.log('✅ Connected to Cloudflare!');
    
    const tools = await cloudflareClient.listTools();
    console.log(`Tools: ${tools.tools.length}`);
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}`);
    });
    
    await cloudflareClient.close();
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
  }
}

testSSE();