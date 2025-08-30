#!/usr/bin/env node

import { EnhancedHatagoHub } from './packages/hub/dist/enhanced-hub.js';

async function test() {
  console.log('Creating Enhanced Hatago Hub...');
  
  const hub = new EnhancedHatagoHub({
    configFile: './test-config.json',
    enableManagement: true,
    enableIdleManagement: true,
    autoStartAlways: true
  });
  
  // Wait a bit for initialization
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  console.log('\n=== Server States ===');
  const states = hub.getServerStates();
  if (states) {
    for (const [serverId, state] of states) {
      console.log(`${serverId}: ${state}`);
    }
  }
  
  console.log('\n=== Testing on-demand activation ===');
  try {
    // This should trigger on-demand activation
    const result = await hub.tools.call('test-server_echo', {}, {
      sessionId: 'test-session-1'
    });
    console.log('Tool call result:', result);
  } catch (error) {
    console.log('Tool call error (expected):', error.message);
  }
  
  console.log('\n=== Server States After Tool Call ===');
  const statesAfter = hub.getServerStates();
  if (statesAfter) {
    for (const [serverId, state] of statesAfter) {
      console.log(`${serverId}: ${state}`);
    }
  }
  
  // Test multiple sessions
  console.log('\n=== Testing multiple sessions ===');
  const sessions = ['session-1', 'session-2', 'session-3'];
  
  for (const sessionId of sessions) {
    try {
      await hub.tools.call('test-server_echo', {}, { sessionId });
      console.log(`Session ${sessionId}: tool call succeeded`);
    } catch (error) {
      console.log(`Session ${sessionId}: ${error.message}`);
    }
  }
  
  console.log('\n=== Idle Manager Activity ===');
  // Access private property for testing
  const idleManager = hub['idleManager'];
  if (idleManager) {
    const activities = idleManager.getAllActivities();
    for (const [serverId, activity] of activities) {
      console.log(`${serverId}:`, {
        referenceCount: activity.referenceCount,
        activeSessions: Array.from(activity.activeSessions),
        totalCalls: activity.totalCalls
      });
    }
  }
  
  // Skip long wait for now
  // console.log('\n=== Waiting for idle timeout (10 seconds) ===');
  // await new Promise(resolve => setTimeout(resolve, 12000));
  
  console.log('\n=== Final Server States ===');
  const finalStates = hub.getServerStates();
  if (finalStates) {
    for (const [serverId, state] of finalStates) {
      console.log(`${serverId}: ${state}`);
    }
  }
  
  await hub.shutdown();
  console.log('\nHub shut down successfully');
  process.exit(0);
}

test().catch(console.error);