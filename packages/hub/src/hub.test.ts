/**
 * Node.js tests for HatagoHub
 */

import { setPlatform } from '@hatago/runtime';
import { createNodePlatform } from '@hatago/runtime/platform/node';
import { beforeEach, describe, expect, it } from 'vitest';
import { HatagoHub } from './hub.js';

describe('HatagoHub (Node.js)', () => {
  beforeEach(() => {
    // Initialize Node.js platform for testing
    setPlatform(createNodePlatform());
  });

  it('should create a hub instance', () => {
    const hub = new HatagoHub();
    expect(hub).toBeInstanceOf(HatagoHub);
  });

  it('should initialize with default options', () => {
    const hub = new HatagoHub();
    expect(hub).toBeDefined();
  });

  it('should accept custom options', () => {
    const hub = new HatagoHub({
      sessionTTL: 7200,
      defaultTimeout: 60000,
    });
    expect(hub).toBeDefined();
  });

  it('should list empty servers initially', async () => {
    const hub = new HatagoHub();
    const servers = await hub.listServers();
    expect(servers).toEqual([]);
  });

  it('should list empty tools initially', async () => {
    const hub = new HatagoHub();
    const tools = await hub.listTools();
    expect(tools).toEqual([]);
  });
});
