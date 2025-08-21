import { describe, expect, it } from 'vitest';
import { createMemoryRegistryStorage } from './memory-registry-storage.js';
import type { ServerState } from './registry-storage.js';

describe('createMemoryRegistryStorage', () => {
  it('should create a storage instance with all required methods', () => {
    const storage = createMemoryRegistryStorage();

    expect(storage).toBeDefined();
    expect(storage.init).toBeInstanceOf(Function);
    expect(storage.saveServerState).toBeInstanceOf(Function);
    expect(storage.getServerState).toBeInstanceOf(Function);
    expect(storage.getAllServerStates).toBeInstanceOf(Function);
    expect(storage.deleteServerState).toBeInstanceOf(Function);
    expect(storage.clear).toBeInstanceOf(Function);
    expect(storage.close).toBeInstanceOf(Function);
  });

  it('should initialize without errors', async () => {
    const storage = createMemoryRegistryStorage();
    await expect(storage.init()).resolves.toBeUndefined();
  });

  it('should save and retrieve server state', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();

    const state: ServerState = {
      id: 'test-server',
      type: 'local',
      state: 'running',
      lastStartedAt: new Date(),
      discoveredTools: ['tool1', 'tool2'],
    };

    await storage.saveServerState('test-server', state);
    const retrieved = await storage.getServerState('test-server');

    expect(retrieved).toEqual(state);
  });

  it('should return null for non-existent server state', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();

    const retrieved = await storage.getServerState('non-existent');
    expect(retrieved).toBeNull();
  });

  it('should get all server states', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();

    const state1: ServerState = {
      id: 'server1',
      type: 'local',
      state: 'running',
    };

    const state2: ServerState = {
      id: 'server2',
      type: 'remote',
      state: 'stopped',
    };

    await storage.saveServerState('server1', state1);
    await storage.saveServerState('server2', state2);

    const allStates = await storage.getAllServerStates();

    expect(allStates.size).toBe(2);
    expect(allStates.get('server1')).toEqual(state1);
    expect(allStates.get('server2')).toEqual(state2);
  });

  it('should delete server state', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();

    const state: ServerState = {
      id: 'test-server',
      type: 'local',
      state: 'running',
    };

    await storage.saveServerState('test-server', state);
    expect(await storage.getServerState('test-server')).toEqual(state);

    await storage.deleteServerState('test-server');
    expect(await storage.getServerState('test-server')).toBeNull();
  });

  it('should clear all states', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();

    await storage.saveServerState('server1', {
      id: 'server1',
      type: 'local',
      state: 'running',
    });

    await storage.saveServerState('server2', {
      id: 'server2',
      type: 'remote',
      state: 'stopped',
    });

    const beforeClear = await storage.getAllServerStates();
    expect(beforeClear.size).toBe(2);

    await storage.clear();

    const afterClear = await storage.getAllServerStates();
    expect(afterClear.size).toBe(0);
  });

  it('should close without errors', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();
    await expect(storage.close()).resolves.toBeUndefined();
  });

  it('should update existing server state', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();

    const initialState: ServerState = {
      id: 'test-server',
      type: 'local',
      state: 'running',
    };

    await storage.saveServerState('test-server', initialState);

    const updatedState: ServerState = {
      id: 'test-server',
      type: 'local',
      state: 'stopped',
      lastStoppedAt: new Date(),
    };

    await storage.saveServerState('test-server', updatedState);

    const retrieved = await storage.getServerState('test-server');
    expect(retrieved).toEqual(updatedState);
  });

  it('should handle failure states correctly', async () => {
    const storage = createMemoryRegistryStorage();
    await storage.init();

    const failedState: ServerState = {
      id: 'failed-server',
      type: 'npx',
      state: 'failed',
      failureCount: 3,
      lastFailureAt: new Date(),
      lastFailureReason: 'Connection timeout',
    };

    await storage.saveServerState('failed-server', failedState);
    const retrieved = await storage.getServerState('failed-server');

    expect(retrieved).toEqual(failedState);
    expect(retrieved?.failureCount).toBe(3);
    expect(retrieved?.lastFailureReason).toBe('Connection timeout');
  });

  it('should create independent storage instances', async () => {
    const storage1 = createMemoryRegistryStorage();
    const storage2 = createMemoryRegistryStorage();

    await storage1.init();
    await storage2.init();

    await storage1.saveServerState('server1', {
      id: 'server1',
      type: 'local',
      state: 'running',
    });

    const storage1States = await storage1.getAllServerStates();
    const storage2States = await storage2.getAllServerStates();

    expect(storage1States.size).toBe(1);
    expect(storage2States.size).toBe(0);
  });
});
