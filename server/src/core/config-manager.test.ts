import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HatagoConfig } from '../config/types.js';
import { ConfigGeneration } from './config-generation.js';
import { ConfigManager } from './config-manager.js';

// Don't mock EventEmitter - ConfigManager extends it

// Mock ConfigGeneration
const createMockGeneration = (id: string, config: HatagoConfig) => ({
  id,
  config,
  createdAt: new Date(),
  referenceCount: 0,
  disposed: false,
  runtime: null,
  addReference: vi.fn(),
  removeReference: vi.fn(),
  getReferenceCount: vi.fn().mockReturnValue(0),
  isActive: vi.fn().mockReturnValue(true),
  canDispose: vi.fn().mockReturnValue(true),
  dispose: vi.fn().mockResolvedValue(undefined),
  getInfo: vi.fn().mockReturnValue({
    id,
    config,
    createdAt: new Date(),
    referenceCount: 0,
    disposed: false,
  }),
  calculateDiff: vi
    .fn()
    .mockReturnValue({ added: [], removed: [], modified: [] }),
});

vi.mock('./config-generation.js', () => ({
  ConfigGeneration: {
    create: vi.fn(),
  },
  GenerationTransition: {
    VALIDATING: 'validating',
    WARMING_UP: 'warming_up',
    ACTIVE: 'active',
    DRAINING: 'draining',
    DRAINED: 'drained',
    DISPOSING: 'disposing',
    DISPOSED: 'disposed',
  },
}));

// Need to export both validateConfig and the types
vi.mock('../config/types.js', async () => {
  const actual = await vi.importActual('../config/types.js');
  return {
    ...actual,
    validateConfig: vi.fn((config) => config),
  };
});

// Mock the mutex
vi.mock('../utils/mutex.js', () => ({
  createMutex: vi.fn(() => ({
    runExclusive: vi.fn((fn) => fn()),
  })),
}));

describe('ConfigManager', () => {
  let manager: ConfigManager;
  let mockGenerationId = 1;

  const createMockConfig = (): HatagoConfig => ({
    version: 1,
    logLevel: 'info',
    http: {
      port: 3000,
      host: 'localhost',
    },
    toolNaming: {
      strategy: 'namespace',
      separator: '_',
    },
    session: {
      ttlSeconds: 3600,
      maxSessions: 100,
      persistSessions: false,
    },
    timeouts: {
      spawnMs: 8000,
      healthcheckMs: 2000,
      toolCallMs: 20000,
      shutdownMs: 5000,
    },
    concurrency: {
      maxWorkersPerServer: 4,
      maxServers: 10,
      maxToolCalls: 50,
    },
    security: {
      redactKeys: ['password', 'secret'],
    },
    servers: [],
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerationId = 1;

    // Reset the create mock for each test
    vi.mocked(ConfigGeneration).create.mockImplementation(async (config) => {
      const gen = createMockGeneration(String(mockGenerationId++), config);
      return gen;
    });

    manager = new ConfigManager({
      maxGenerations: 3,
      gracePeriodMs: 1000,
    });
  });

  describe('getCurrentGeneration', () => {
    it('should return null initially', () => {
      const gen = manager.getCurrentGeneration();
      expect(gen).toBeNull();
    });

    it('should return current generation after loading config', async () => {
      const config = createMockConfig();
      await manager.loadNewConfig(config);

      const gen = manager.getCurrentGeneration();
      expect(gen).toBeDefined();
      expect(gen?.id).toBe('1');
    });
  });

  describe('getCurrentConfig', () => {
    it('should return null initially', () => {
      const config = manager.getCurrentConfig();
      expect(config).toBeNull();
    });

    it('should return current config after loading', async () => {
      const config = createMockConfig();
      await manager.loadNewConfig(config);

      const currentConfig = manager.getCurrentConfig();
      expect(currentConfig).toBeDefined();
      expect(currentConfig?.version).toBe(1);
    });
  });

  describe('getGeneration', () => {
    it('should return generation by id', async () => {
      const config = createMockConfig();
      await manager.loadNewConfig(config);

      const gen = manager.getGeneration('1');
      expect(gen).toBeDefined();
      expect(gen?.id).toBe('1');
    });

    it('should return undefined for non-existent generation', () => {
      const gen = manager.getGeneration('999');
      expect(gen).toBeUndefined();
    });
  });

  describe('getAllGenerations', () => {
    it('should return empty array initially', () => {
      const generations = manager.getAllGenerations();
      expect(generations).toHaveLength(0);
    });

    it('should return all generations after loading', async () => {
      const config = createMockConfig();
      await manager.loadNewConfig(config);

      const generations = manager.getAllGenerations();
      expect(generations).toHaveLength(1);
      expect(generations[0].id).toBe('1');
    });
  });

  describe('loadNewConfig', () => {
    it('should create a new generation with new config', async () => {
      const newConfig = createMockConfig();
      newConfig.http.port = 4000;

      const generation = await manager.loadNewConfig(newConfig);

      expect(generation).toBeDefined();
      expect(generation.id).toBe('1');
      expect(generation.config.http.port).toBe(4000);
    });

    it('should store the new generation', async () => {
      const newConfig = createMockConfig();
      const generation = await manager.loadNewConfig(newConfig);

      const stored = manager.getGeneration(generation.id);
      expect(stored).toBe(generation);
    });

    it('should handle creation failure', async () => {
      const { ConfigGeneration } = vi.mocked(
        await import('./config-generation.js'),
      );
      ConfigGeneration.create.mockRejectedValueOnce(
        new Error('Creation failed'),
      );

      const newConfig = createMockConfig();

      await expect(manager.loadNewConfig(newConfig)).rejects.toThrow(
        'Creation failed',
      );
    });
  });

  describe('switchToGeneration', () => {
    it('should switch to existing generation', async () => {
      const newConfig = createMockConfig();
      const generation = await manager.loadNewConfig(newConfig);

      // The new generation becomes current after loadNewConfig
      // Load another one to test switching
      const config2 = createMockConfig();
      config2.http.port = 4000;
      await manager.loadNewConfig(config2);

      // Switch back to first generation
      await expect(
        manager.switchToGeneration(generation.id),
      ).resolves.not.toThrow();
      expect(manager.getCurrentGeneration()?.id).toBe(generation.id);
    });

    it('should fail when generation does not exist', async () => {
      await expect(manager.switchToGeneration('999')).rejects.toThrow(
        'not found',
      );
    });

    it('should fail when transition is not active', async () => {
      const newConfig = createMockConfig();
      const generation = await manager.loadNewConfig(newConfig);

      // Mock the transition state
      const transitions = (
        manager as unknown as { transitions: Map<string, string> }
      ).transitions;
      transitions.set(generation.id, 'DISPOSED');

      await expect(manager.switchToGeneration(generation.id)).rejects.toThrow();
    });

    it('should set current generation on switch', async () => {
      const config1 = createMockConfig();
      const gen1 = await manager.loadNewConfig(config1);

      const config2 = createMockConfig();
      config2.http.port = 4000;
      const gen2 = await manager.loadNewConfig(config2);

      expect(manager.getCurrentGeneration()?.id).toBe(gen2.id);

      await manager.switchToGeneration(gen1.id);
      expect(manager.getCurrentGeneration()?.id).toBe(gen1.id);
    });
  });

  describe('rollbackToPrevious', () => {
    it('should rollback to previous generation', async () => {
      const config1 = createMockConfig();
      const gen1 = await manager.loadNewConfig(config1);

      const config2 = createMockConfig();
      config2.http.port = 4000;
      const gen2 = await manager.loadNewConfig(config2);

      expect(manager.getCurrentGeneration()?.id).toBe(gen2.id);

      await expect(manager.rollbackToPrevious()).resolves.not.toThrow();
      expect(manager.getCurrentGeneration()?.id).toBe(gen1.id);
    });

    it('should fail when no previous generation exists', async () => {
      await expect(manager.rollbackToPrevious()).rejects.toThrow();
    });
  });

  describe('cleanupOldGenerations', () => {
    it('should call cleanup method', async () => {
      // Create multiple generations
      for (let i = 0; i < 4; i++) {
        const config = createMockConfig();
        config.http.port = 3000 + i;
        await manager.loadNewConfig(config);
      }

      // cleanupOldGenerations is a method that should exist
      await expect(manager.cleanupOldGenerations()).resolves.not.toThrow();
    });
  });

  describe('getGenerationStatus', () => {
    it('should return status for all generations', async () => {
      const config = createMockConfig();
      const gen = await manager.loadNewConfig(config);

      const status = manager.getGenerationStatus();

      expect(status.currentGenerationId).toBe(gen.id);
      expect(status.generations).toHaveLength(1);
      expect(status.generations[0].id).toBe(gen.id);
    });
  });

  describe('shutdown', () => {
    it('should dispose all generations', async () => {
      const config1 = createMockConfig();
      const gen1 = await manager.loadNewConfig(config1);

      const config2 = createMockConfig();
      const gen2 = await manager.loadNewConfig(config2);

      await manager.shutdown();

      expect(gen1.dispose).toHaveBeenCalled();
      expect(gen2.dispose).toHaveBeenCalled();
    });

    it('should handle disposal errors gracefully', async () => {
      const config = createMockConfig();
      const gen = await manager.loadNewConfig(config);
      gen.dispose = vi.fn().mockRejectedValue(new Error('Disposal failed'));

      // Should not throw
      await expect(manager.shutdown()).resolves.not.toThrow();
    });
  });
});
