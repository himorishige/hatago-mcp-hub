#!/usr/bin/env node

/**
 * Direct test for Hatago in STDIO mode
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testHatagoStdio() {
  console.error('Testing Hatago in STDIO mode...\n');

  // Create transport connecting to Hatago
  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'dist/cli/index.js',
      'serve',
      '--config',
      'hatago-test.config.json',
      '--verbose'
    ]
  });

  // Create MCP client
  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    // Connect
    console.error('🔌 Connecting to Hatago...');
    await client.connect(transport);
    console.error('✅ Connected!\n');

    // Get server info
    console.error('📋 Server Information:');
    console.error('  Name:', client.getServerInfo()?.name || 'Unknown');
    console.error('  Version:', client.getServerInfo()?.version || 'Unknown');

    // List tools
    console.error('\n🔧 Available Tools:');
    const tools = await client.listTools();
    if (tools.tools.length === 0) {
      console.error('  (No tools available)');
    } else {
      tools.tools.forEach(tool => {
        console.error(`  - ${tool.name}`);
        if (tool.description) {
          console.error(`    ${tool.description}`);
        }
      });
    }

    // List resources
    console.error('\n📦 Available Resources:');
    const resources = await client.listResources();
    if (resources.resources.length === 0) {
      console.error('  (No resources available)');
    } else {
      resources.resources.forEach(resource => {
        console.error(`  - ${resource.uri}`);
        if (resource.name) {
          console.error(`    Name: ${resource.name}`);
        }
      });
    }

    // List prompts
    console.error('\n💬 Available Prompts:');
    const prompts = await client.listPrompts();
    if (prompts.prompts.length === 0) {
      console.error('  (No prompts available)');
    } else {
      prompts.prompts.forEach(prompt => {
        console.error(`  - ${prompt.name}`);
        if (prompt.description) {
          console.error(`    ${prompt.description}`);
        }
      });
    }

    // Try calling a tool if available
    const testTool = tools.tools.find(t => t.name.includes('hello') || t.name.includes('test'));
    if (testTool) {
      console.error(`\n🧪 Testing Tool: ${testTool.name}`);
      try {
        const result = await client.callTool({
          name: testTool.name,
          arguments: testTool.name.includes('hello') ? { name: 'Hatago' } : {}
        });
        console.error('  Result:', JSON.stringify(result.content, null, 2));
      } catch (error) {
        console.error('  Error:', error.message);
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  } finally {
    // Cleanup
    console.error('\n👋 Disconnecting...');
    await client.close();
    console.error('✅ Test completed');
  }
}

// Run test
testHatagoStdio().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});