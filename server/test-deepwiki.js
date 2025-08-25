#!/usr/bin/env node

import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

async function testDeepWikiConnection() {
  console.log('Testing connection to DeepWiki MCP server...');
  
  try {
    // Try SSE endpoint first (recommended)
    console.log('\n1. Testing SSE endpoint: https://mcp.deepwiki.com/sse');
    const sseTransport = new SSEClientTransport(
      new URL('https://mcp.deepwiki.com/sse')
    );
    
    const sseClient = new Client({
      name: 'hatago-test-client',
      version: '1.0.0'
    }, {
      capabilities: {}
    });
    
    await sseClient.connect(sseTransport);
    console.log('✅ Successfully connected to SSE endpoint!');
    
    // List available tools
    const tools = await sseClient.listTools();
    console.log(`Available tools: ${tools.tools.length}`);
    tools.tools.forEach(tool => {
      console.log(`  - ${tool.name}: ${tool.description?.substring(0, 50)}...`);
    });
    
    // List available resources
    const resources = await sseClient.listResources();
    console.log(`\nAvailable resources: ${resources.resources.length}`);
    resources.resources.forEach(resource => {
      console.log(`  - ${resource.name}: ${resource.description?.substring(0, 50)}...`);
    });
    
    await sseClient.close();
    
  } catch (error) {
    console.error('❌ SSE connection failed:', error.message);
  }
  
  // Also test Streamable HTTP endpoint
  try {
    console.log('\n2. Testing Streamable HTTP endpoint: https://mcp.deepwiki.com/mcp');
    
    // Note: MCP SDK doesn't have built-in Streamable HTTP client yet
    // We'll test with a simple HTTP request
    const response = await fetch('https://mcp.deepwiki.com/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        method: 'initialize',
        params: {
          protocolVersion: '2025-06-18',
          capabilities: {},
          clientInfo: {
            name: 'hatago-test',
            version: '1.0.0'
          }
        },
        id: 1
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      console.log('✅ Streamable HTTP endpoint responded:', JSON.stringify(data, null, 2));
    } else {
      console.log(`❌ Streamable HTTP failed with status: ${response.status}`);
    }
    
  } catch (error) {
    console.error('❌ Streamable HTTP connection failed:', error.message);
  }
}

testDeepWikiConnection();