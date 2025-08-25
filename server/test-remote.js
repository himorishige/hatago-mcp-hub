#!/usr/bin/env node

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function testRemoteConnection() {
  console.log('Testing remote connection to http://localhost:3001/mcp/v1/sse');
  
  try {
    const transport = new SSEClientTransport(
      new URL('http://localhost:3001/mcp/v1/sse')
    );
    
    const client = new Client({
      name: 'test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await client.connect(transport);
    console.log('✅ Successfully connected!');
    
    const result = await client.listTools();
    console.log('Available tools:', result.tools.length);
    
    await client.close();
  } catch (error) {
    console.error('❌ Connection failed:', error.message);
    console.error(error);
  }
}

testRemoteConnection();