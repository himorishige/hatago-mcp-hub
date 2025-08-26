#!/usr/bin/env node

/**
 * Test Hatago in STDIO mode with silent operation
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

async function testHatagoSilent() {
  console.log('🏨 Testing Hatago Hub (Silent Mode)\n');

  const transport = new StdioClientTransport({
    command: 'node',
    args: [
      'dist/cli/index.js',
      'serve',
      '--config',
      'hatago-test-local.config.json',  // Use local config to avoid slow remote connections
      '--quiet',  // Suppress info logs
      '--log-level',
      'error'     // Only show errors
    ]
  });

  const client = new Client({
    name: 'test-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    process.stdout.write('Connecting... ');
    await client.connect(transport);
    console.log('✅');

    // List tools
    const tools = await client.listTools();
    console.log(`\nFound ${tools.tools.length} tools:`);
    
    // Group by server
    const byServer = {};
    tools.tools.forEach(t => {
      const [srv] = t.name.split('_');
      byServer[srv] = (byServer[srv] || 0) + 1;
    });
    
    Object.entries(byServer).forEach(([srv, count]) => {
      console.log(`  ${srv}: ${count} tools`);
    });

    // Test a tool
    const testTool = tools.tools.find(t => 
      t.name === 'test-server_test_hello' || 
      t.name === 'everything_echo'
    );
    
    if (testTool) {
      console.log(`\nTesting ${testTool.name}...`);
      const args = testTool.name.includes('hello') 
        ? { name: 'Silent Test' }
        : { message: 'Silent Test' };
      
      const result = await client.callTool({
        name: testTool.name,
        arguments: args
      });
      
      console.log('Response:', result.content[0]?.text || 'OK');
    }

    console.log('\n✅ All tests passed!');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.close();
  }
}

testHatagoSilent().catch(console.error);