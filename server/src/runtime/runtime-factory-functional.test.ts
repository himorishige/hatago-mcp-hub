import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isErr, isOk } from '../utils/result.js';
import {
  checkRuntimeCapabilities,
  composeRuntime,
  createCustomRuntimeFactory,
  createRuntimeFactory,
  detectRuntimeEnvironment,
} from './runtime-factory-functional.js';
import type { Runtime } from './types.js';

describe('Functional Runtime Factory', () => {
  const mockRuntime: Runtime = {
    name: 'mock',
    spawn: vi.fn(),
    createWebSocket: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    generateId: vi.fn().mockReturnValue('mock-id'),
    hash: vi.fn().mockReturnValue('mock-hash'),
    env: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('detectRuntimeEnvironment', () => {
    it('should detect Node.js by default', () => {
      const env = detectRuntimeEnvironment();
      expect(env).toBe('node');
    });
  });

  describe('createRuntimeFactory', () => {
    it('should create a factory with getRuntime method', () => {
      const factory = createRuntimeFactory();
      expect(factory.getRuntime).toBeDefined();
      expect(factory.reset).toBeDefined();
      expect(factory.getCacheState).toBeDefined();
    });

    it('should cache runtime instance', async () => {
      const factory = createRuntimeFactory();

      const result1 = await factory.getRuntime();
      const result2 = await factory.getRuntime();

      expect(isOk(result1)).toBe(true);
      expect(isOk(result2)).toBe(true);

      if (isOk(result1) && isOk(result2)) {
        // Should be the same instance
        expect(result1.value).toBe(result2.value);
      }
    });

    it('should report cache state correctly', async () => {
      const factory = createRuntimeFactory();

      // Initially not cached
      expect(factory.getCacheState()).toEqual({
        cached: false,
        initializing: false,
      });

      // Start initialization
      const promise = factory.getRuntime();
      expect(factory.getCacheState()).toEqual({
        cached: false,
        initializing: true,
      });

      // After initialization
      await promise;
      expect(factory.getCacheState()).toEqual({
        cached: true,
        initializing: false, // Promise resolves and clears
      });
    });

    it('should reset cache', async () => {
      const factory = createRuntimeFactory();

      // Get runtime to cache it
      await factory.getRuntime();
      expect(factory.getCacheState().cached).toBe(true);

      // Reset
      factory.reset();
      expect(factory.getCacheState()).toEqual({
        cached: false,
        initializing: false,
      });
    });
  });

  describe('createCustomRuntimeFactory', () => {
    it('should use custom loader', async () => {
      const customLoader = vi.fn().mockResolvedValue({
        ok: true,
        value: mockRuntime,
      });

      const factory = createCustomRuntimeFactory({
        node: customLoader,
      });

      const result = await factory.getRuntime();

      expect(customLoader).toHaveBeenCalled();
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(mockRuntime);
      }
    });

    it('should handle custom loader errors', async () => {
      const customLoader = vi.fn().mockResolvedValue({
        ok: false,
        error: new Error('Custom error'),
      });

      const factory = createCustomRuntimeFactory({
        node: customLoader,
      });

      const result = await factory.getRuntime();

      expect(isErr(result)).toBe(true);
    });
  });

  describe('checkRuntimeCapabilities', () => {
    it('should detect all capabilities', async () => {
      const result = await checkRuntimeCapabilities(mockRuntime);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.capabilities).toContain('spawn');
        expect(result.value.capabilities).toContain('websocket');
        expect(result.value.capabilities).toContain('filesystem');
        expect(result.value.capabilities).toContain('crypto');
        expect(result.value.limitations).toHaveLength(0);
      }
    });

    it('should detect limitations', async () => {
      const limitedRuntime: Runtime = {
        name: 'limited',
        env: {},
        // Missing most capabilities
        generateId: vi.fn(),
      };

      const result = await checkRuntimeCapabilities(limitedRuntime);

      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value.capabilities).toHaveLength(0);
        expect(result.value.limitations).toContain('spawn');
        expect(result.value.limitations).toContain('websocket');
        expect(result.value.limitations).toContain('filesystem');
        expect(result.value.limitations).toContain('crypto');
      }
    });
  });

  describe('composeRuntime', () => {
    it('should compose runtimes with extensions', () => {
      const base: Runtime = {
        name: 'base',
        spawn: vi.fn(),
        env: {},
      };

      const extensions: Partial<Runtime> = {
        createWebSocket: vi.fn(),
        readFile: vi.fn(),
      };

      const composed = composeRuntime(base, extensions);

      expect(composed.name).toBe('base'); // Preserve base name
      expect(composed.spawn).toBe(base.spawn);
      expect(composed.createWebSocket).toBe(extensions.createWebSocket);
      expect(composed.readFile).toBe(extensions.readFile);
    });

    it('should override base properties except name', () => {
      const base: Runtime = {
        name: 'base',
        spawn: vi.fn(),
        env: { NODE_ENV: 'test' },
      };

      const extensions: Partial<Runtime> = {
        name: 'should-be-ignored',
        spawn: vi.fn(), // Override spawn
        env: { NODE_ENV: 'production' }, // Override env
      };

      const composed = composeRuntime(base, extensions);

      expect(composed.name).toBe('base'); // Name not overridden
      expect(composed.spawn).toBe(extensions.spawn); // Spawn overridden
      expect(composed.env).toBe(extensions.env); // Env overridden
    });
  });
});
