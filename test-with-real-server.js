#!/usr/bin/env node

import { setPlatform } from './packages/runtime/dist/index.js';
import { createNodePlatform } from './packages/runtime/dist/platform/node.js';
import { EnhancedHatagoHub } from './packages/hub/dist/enhanced-hub.js';
import { writeFileSync } from 'fs';

// Initialize platform first
setPlatform(createNodePlatform());

// Create a test config with a real MCP server
const testConfig = {
  version: 1,
  mcpServers: {
    "filesystem": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      activationPolicy: "onDemand",
      idlePolicy: {
        maxIdleMinutes: 1,
        checkIntervalMinutes: 0.5
      }
    },
    "everything": {
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-everything"],
      activationPolicy: "always"
    }
  }
};

// Write config to file
writeFileSync('./test-real-config.json', JSON.stringify(testConfig, null, 2));

async function simulateClient(hub, sessionId) {
  console.log(`\n[${sessionId}] Starting client session`);
  
  try {
    // List available tools
    const tools = await hub.tools.list({ sessionId });
    console.log(`[${sessionId}] Available tools: ${tools.map(t => t.name).slice(0, 5).join(', ')}...`);
    
    // Try to call a filesystem tool if available
    const fsTools = tools.filter(t => t.name.includes('read') || t.name.includes('list'));
    if (fsTools.length > 0) {
      console.log(`[${sessionId}] Calling tool: ${fsTools[0].name}`);
      try {
        const result = await hub.tools.call(
          fsTools[0].name,
          { path: '/tmp' },
          { sessionId, timeout: 5000 }
        );
        console.log(`[${sessionId}] Tool call successful`);
      } catch (error) {
        console.log(`[${sessionId}] Tool call failed: ${error.message}`);
      }
    }
    
  } catch (error) {
    console.log(`[${sessionId}] Error: ${error.message}`);
  }
  
  console.log(`[${sessionId}] Session complete`);
}

async function test() {
  console.log('=== Testing with Real MCP Servers ===');
  
  try {
    const hub = new EnhancedHatagoHub({
      configFile: './test-real-config.json',
      enableManagement: true,
      enableIdleManagement: true,
      autoStartAlways: true  // Enable auto-start for 'always' servers
    });
    
    // Wait for initialization and 'always' servers to start
    console.log('\nWaiting for servers to initialize...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Check initial server states
    console.log('\n=== Initial Server States ===');
    const initialStates = hub.getServerStates();
    if (initialStates) {
      for (const [serverId, state] of initialStates) {
        console.log(`  ${serverId}: ${state}`);
      }
    }
    
    // Simulate multiple clients
    console.log('\n=== Starting Client Simulations ===');
    await simulateClient(hub, 'session-A');
    await simulateClient(hub, 'session-B');
    
    // Check server states after activity
    console.log('\n=== Server States After Activity ===');
    const afterStates = hub.getServerStates();
    if (afterStates) {
      for (const [serverId, state] of afterStates) {
        console.log(`  ${serverId}: ${state}`);
      }
    }
    
    // Wait a bit to see if idle management kicks in
    console.log('\n=== Waiting for idle timeout (30 seconds) ===');
    await new Promise(resolve => setTimeout(resolve, 30000));
    
    // Check final server states
    console.log('\n=== Final Server States ===');
    const finalStates = hub.getServerStates();
    if (finalStates) {
      for (const [serverId, state] of finalStates) {
        console.log(`  ${serverId}: ${state}`);
      }
    }
    
    console.log('\nTest completed successfully');
    await hub.shutdown();
    
  } catch (error) {
    console.error('Test failed:', error);
  }
  
  process.exit(0);
}

test();