/**
 * Platform abstraction types
 *
 * Defines the interface for platform-specific implementations.
 * Uses capability-based design to handle optional features.
 */

import type { ChildProcess } from 'node:child_process';

/**
 * Configuration storage interface
 */
export type ConfigStore = {
  get: (key: string) => Promise<unknown>;
  set: (key: string, value: unknown) => Promise<void>;
  delete: (key: string) => Promise<void>;
  list: () => Promise<string[]>;
};

/**
 * Session storage interface
 */
export type SessionStore = {
  create: (id: string, data: unknown) => Promise<void>;
  get: (id: string) => Promise<unknown>;
  update: (id: string, data: unknown) => Promise<void>;
  delete: (id: string) => Promise<void>;
  exists: (id: string) => Promise<boolean>;
  list: () => Promise<string[]>;
};

/**
 * Process spawn options
 */
export type SpawnOptions = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
};

/**
 * Platform capabilities interface
 * Required features are always present, optional features use capability pattern
 */
export type Platform = {
  // Required features (available in all environments)
  randomUUID(): string;
  getEnv(key: string): string | undefined;

  // Optional capabilities (Node.js specific)
  spawn?: (options: SpawnOptions) => ChildProcess;
  readFile?: (path: string) => Promise<string>;
  writeFile?: (path: string, content: string) => Promise<void>;

  // Storage abstraction (implementation varies by platform)
  storage: {
    config: ConfigStore;
    session: SessionStore;
  };

  // Platform identification
  name: 'node' | 'workers' | 'browser';

  // Feature detection helpers
  capabilities: {
    hasFileSystem: boolean;
    hasProcessSpawn: boolean;
    hasWebCrypto: boolean;
    hasDurableObjects: boolean;
    hasKVStorage: boolean;
  };
};

/**
 * Platform initialization options
 */
export type PlatformOptions = {
  env?: Record<string, unknown>;
  storage?: {
    configPath?: string;
    sessionTTL?: number;
  };
};

/**
 * Error thrown when attempting to use unsupported features
 */
export class UnsupportedFeatureError extends Error {
  constructor(
    public feature: string,
    public runtime: string
  ) {
    super(`Feature "${feature}" is not supported on ${runtime} runtime`);
    this.name = 'UnsupportedFeatureError';
  }
}
