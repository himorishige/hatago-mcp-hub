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
export interface ConfigStore {
  get(key: string): Promise<any>;
  set(key: string, value: any): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<string[]>;
}

/**
 * Session storage interface
 */
export interface SessionStore {
  create(id: string, data: any): Promise<void>;
  get(id: string): Promise<any>;
  update(id: string, data: any): Promise<void>;
  delete(id: string): Promise<void>;
  exists(id: string): Promise<boolean>;
  list(): Promise<string[]>;
}

/**
 * Process spawn options
 */
export interface SpawnOptions {
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
}

/**
 * Platform capabilities interface
 * Required features are always present, optional features use capability pattern
 */
export interface Platform {
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
}

/**
 * Platform initialization options
 */
export interface PlatformOptions {
  env?: Record<string, any>;
  storage?: {
    configPath?: string;
    sessionTTL?: number;
  };
}

/**
 * Error thrown when attempting to use unsupported features
 */
export class UnsupportedFeatureError extends Error {
  constructor(
    public feature: string,
    public runtime: string,
  ) {
    super(`Feature "${feature}" is not supported on ${runtime} runtime`);
    this.name = 'UnsupportedFeatureError';
  }
}
