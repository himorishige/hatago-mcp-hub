import { describe, it, expect, beforeEach, vi, type MockedFunction } from 'vitest';
import { HatagoHub } from './hub.js';
import type { HubOptions } from './types.js';
import { Logger } from './logger.js';

// Mock fs module
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn()
}));

// Mock path module
vi.mock('node:path', () => ({
  resolve: vi.fn((path: string) => path)
}));

describe('HatagoHub start() config loading', () => {
  let hub: HatagoHub;
  let logger: Logger;

  beforeEach(() => {
    vi.clearAllMocks();
    logger = new Logger(); // Default logger for tests
  });

  it('should prioritize preloadedConfig.data when both preloadedConfig and configFile are provided', async () => {
    const preloadedData = {
      version: 1,
      mcpServers: {}
    };

    const options: HubOptions = {
      configFile: '/path/to/config.json',
      preloadedConfig: {
        path: '/path/to/config.json',
        data: preloadedData
      },
      logger
    };

    hub = new HatagoHub(options);

    await hub.start();

    // Verify fs.readFileSync was NOT called (preloadedConfig was used instead)
    const fs = await import('node:fs');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should read config file directly when only configFile is provided', async () => {
    const fileContent = JSON.stringify({
      version: 1,
      mcpServers: {}
    });

    const fs = await import('node:fs');
    (fs.readFileSync as MockedFunction<typeof fs.readFileSync>).mockReturnValue(fileContent);

    const options: HubOptions = {
      configFile: '/path/to/config.json',
      logger
    };

    hub = new HatagoHub(options);

    await hub.start();

    // Verify fs.readFileSync was called
    expect(fs.readFileSync).toHaveBeenCalledWith('/path/to/config.json', 'utf-8');
  });

  it('should use empty config when neither preloadedConfig nor configFile is provided', async () => {
    const options: HubOptions = {
      logger
    };

    hub = new HatagoHub(options);

    await hub.start();

    // Verify fs.readFileSync was NOT called
    const fs = await import('node:fs');
    expect(fs.readFileSync).not.toHaveBeenCalled();
  });

  it('should handle config with notification settings from preloadedConfig', async () => {
    const preloadedData = {
      version: 1,
      notifications: {
        enabled: true,
        rateLimitSec: 30,
        severity: ['error']
      },
      mcpServers: {}
    };

    const options: HubOptions = {
      preloadedConfig: {
        path: '/path/to/config.json',
        data: preloadedData
      },
      logger
    };

    hub = new HatagoHub(options);

    await hub.start();

    // Verify notification manager was initialized
    // Note: This is a private property, but we're testing internal behavior
    expect((hub as any).notificationManager).toBeDefined();
  });

  it('should handle invalid JSON in config file gracefully', async () => {
    const fs = await import('node:fs');
    (fs.readFileSync as MockedFunction<typeof fs.readFileSync>).mockReturnValue('{ invalid json');

    const options: HubOptions = {
      configFile: '/path/to/invalid.json',
      logger
    };

    hub = new HatagoHub(options);

    // Should throw error for invalid JSON
    await expect(hub.start()).rejects.toThrow();
  });
});
