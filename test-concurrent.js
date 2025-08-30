#!/usr/bin/env node

import { setPlatform } from './packages/runtime/dist/index.js';
import { createNodePlatform } from './packages/runtime/dist/platform/node.js';
import { EnhancedHatagoHub } from './packages/hub/dist/enhanced-hub.js';

// Initialize platform first
setPlatform(createNodePlatform());

async function simulateClient(hub, sessionId, delay = 0) {
  await new Promise(resolve => setTimeout(resolve, delay));
  
  console.log(`[${sessionId}] Starting client simulation`);
  
  // Simulate multiple tool calls
  for (let i = 0; i < 3; i++) {
    try {
      console.log(`[${sessionId}] Attempting tool call ${i + 1}`);
      // This will fail since tools don't exist, but sessionId should be tracked
      await hub.tools.call(`test_tool_${i}`, { data: `from ${sessionId}` }, { sessionId });
    } catch (error) {
      console.log(`[${sessionId}] Tool call ${i + 1} result: ${error.message}`);
    }
    
    // Small delay between calls
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  console.log(`[${sessionId}] Client simulation complete`);
}

async function test() {
  console.log('=== Testing Concurrent Multi-Client Access ===\n');
  
  try {
    const hub = new EnhancedHatagoHub({
      configFile: './test-config.json',
      enableManagement: true,
      enableIdleManagement: true,
      autoStartAlways: false
    });
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Start multiple clients concurrently
    const clients = [
      simulateClient(hub, 'client-1', 0),
      simulateClient(hub, 'client-2', 100),
      simulateClient(hub, 'client-3', 200),
      simulateClient(hub, 'client-4', 50)
    ];
    
    // Wait for all clients to complete
    await Promise.all(clients);
    
    console.log('\n=== Final Server States ===');
    const states = hub.getServerStates();
    if (states) {
      for (const [serverId, state] of states) {
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