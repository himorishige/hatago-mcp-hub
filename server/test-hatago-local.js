#!/usr/bin/env node

/**
 * Test Hatago with local servers only
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testHatagoLocal() {
  console.error('Testing Hatago with local servers...\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'dist/cli/index.js',
      'serve',
      '--config',
      'hatago-test-local.config.json'
    ]
  });

  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    console.error('Connecting...');
    await client.connect(transport);
    console.error('Connected!\n');

    // Quick test
    const tools = await client.listTools();
    console.error(`Found ${tools.tools.length} tools`);
    
    // List first 5 tools
    tools.tools.slice(0, 5).forEach(tool => {
      console.error(`  - ${tool.name}`);
    });

    if (tools.tools.length > 5) {
      console.error(`  ... and ${tools.tools.length - 5} more`);
    }

    // Try test_hello if available
    const helloTool = tools.tools.find(t => t.name === 'test_hello' || t.name === 'test-server_test_hello');
    if (helloTool) {
      console.error(`\nCalling ${helloTool.name}...`);
      const result = await client.callTool({
        name: helloTool.name,
        arguments: { name: 'Hatago' }
      });
      console.error('Response:', result.content[0]?.text || 'No response');
    }

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.close();
    console.error('\nTest completed');
  }
}

testHatagoLocal().catch(console.error);