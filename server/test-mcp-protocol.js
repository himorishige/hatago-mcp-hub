#!/usr/bin/env node

/**
 * Direct MCP protocol test - checks for any stdout pollution
 */

import { spawn } from 'child_process';

const server = spawn('node', [
  'dist/cli/index.js',
  'serve',
  '--config',
  'hatago-test-local.config.json'
], {
  stdio: ['pipe', 'pipe', 'ignore'] // stdin, stdout, stderr (ignore stderr)
});

let buffer = '';
let messages = [];

server.stdout.on('data', (data) => {
  buffer += data.toString();
  
  // Try to parse JSON-RPC messages
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  for (const line of lines) {
    if (line.trim()) {
      try {
        const msg = JSON.parse(line);
        if (msg.jsonrpc === '2.0') {
          console.log('✅ Valid JSON-RPC message received');
          messages.push(msg);
        } else {
          console.error('❌ Invalid message (missing jsonrpc):', line);
        }
      } catch (e) {
        console.error('❌ Non-JSON output detected:', line);
        process.exit(1);
      }
    }
  }
});

// Send initialize request
setTimeout(() => {
  const initRequest = {
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '1.0',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    }
  };
  
  server.stdin.write(JSON.stringify(initRequest) + '\n');
  console.log('📤 Sent initialize request');
}, 100);

// Check results after 2 seconds
setTimeout(() => {
  if (messages.length > 0) {
    console.log(`\n✅ Protocol test passed! Received ${messages.length} valid JSON-RPC messages`);
    console.log('No stdout pollution detected.');
  } else {
    console.log('\n⚠️ No messages received');
  }
  
  server.kill();
  process.exit(0);
}, 2000);