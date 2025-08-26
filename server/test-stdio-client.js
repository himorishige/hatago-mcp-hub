#!/usr/bin/env node

/**
 * Test client for STDIO mode MCP server
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { spawn } from 'child_process';

async function testStdioConnection() {
  console.error('Starting STDIO test client...');

  // Spawn the Hatago server process
  const serverProcess = spawn('node', [
    './dist/cli/index.js',
    'serve',
    '--config',
    'hatago-test.config.json',
    '--verbose'
  ], {
    stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
    cwd: process.cwd()
  });

  // Create MCP client transport
  const transport = new StdioClientTransport({
    command: 'node',
    args: [],
    stdin: serverProcess.stdout,
    stdout: serverProcess.stdin
  });

  // Create MCP client
  const client = new Client({
    name: 'test-stdio-client',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  try {
    // Connect to the server
    console.error('Connecting to server...');
    await client.connect(transport);
    console.error('Connected successfully!');

    // List available tools
    console.error('\n--- Listing Tools ---');
    const tools = await client.listTools();
    console.error(`Found ${tools.tools.length} tools:`);
    tools.tools.forEach(tool => {
      console.error(`  - ${tool.name}: ${tool.description}`);
    });

    // List available resources
    console.error('\n--- Listing Resources ---');
    const resources = await client.listResources();
    console.error(`Found ${resources.resources.length} resources:`);
    resources.resources.forEach(resource => {
      console.error(`  - ${resource.name}: ${resource.description || 'No description'}`);
    });

    // Test calling a tool if available
    if (tools.tools.length > 0) {
      console.error('\n--- Testing Tool Call ---');
      const testTool = tools.tools.find(t => t.name === 'everything_test_hello') || tools.tools[0];
      console.error(`Calling tool: ${testTool.name}`);
      
      try {
        const result = await client.callTool({
          name: testTool.name,
          arguments: testTool.name === 'everything_test_hello' ? { name: 'Test' } : {}
        });
        console.error('Tool result:', JSON.stringify(result, null, 2));
      } catch (error) {
        console.error('Tool call failed:', error.message);
      }
    }

    // Wait a bit before disconnecting
    await new Promise(resolve => setTimeout(resolve, 1000));

  } catch (error) {
    console.error('Error:', error);
  } finally {
    // Cleanup
    console.error('\n--- Disconnecting ---');
    await client.close();
    serverProcess.kill();
    console.error('Test completed');
  }
}

// Run the test
testStdioConnection().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});