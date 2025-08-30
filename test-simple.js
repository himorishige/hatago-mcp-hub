#!/usr/bin/env node

import { setPlatform } from './packages/runtime/dist/index.js';
import { createNodePlatform } from './packages/runtime/dist/platform/node.js';
import { EnhancedHatagoHub } from './packages/hub/dist/enhanced-hub.js';

// Initialize platform first
setPlatform(createNodePlatform());

async function test() {
  console.log('=== Testing Enhanced Hatago Hub ===\n');
  
  try {
    const hub = new EnhancedHatagoHub({
      configFile: './test-config.json',
      enableManagement: true,
      enableIdleManagement: true,
      autoStartAlways: false  // Disable for now
    });
    
    // Wait for initialization
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Check server states
    console.log('Server states:');
    const states = hub.getServerStates();
    if (states) {
      for (const [serverId, state] of states) {
        console.log(`  ${serverId}: ${state}`);
      }
    }
    
    // Test sessionId in tool call
    console.log('\nTesting sessionId propagation:');
    const sessions = ['session-1', 'session-2'];
    
    for (const sessionId of sessions) {
      console.log(`  Calling with sessionId: ${sessionId}`);
      try {
        // Even if tool doesn't exist, the sessionId should be passed through
        await hub.tools.call('dummy_tool', {}, { sessionId });
      } catch (error) {
        // Expected to fail, but sessionId should be processed
        console.log(`    Result: ${error.message}`);
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