/**
 * Cloudflare Workers Platform implementation
 */
import type {
  Crypto,
  EventBus,
  Logger,
  MCPTransport,
  Platform,
  PlatformConfig,
  ProcessRunner,
  RuntimeCapabilities,
  Storage,
} from '../types.js';
import { WorkersCrypto } from './crypto.js';
import { WorkersEventBus } from './events.js';
import { WorkersKVStorage } from './kv-storage.js';
import { WorkersLogger } from './logger.js';
import { WorkersProcessRunner } from './process.js';
import { KVStorage, WorkersMemoryStorage } from './storage.js';
import { WorkersMCPTransport } from './transport.js';

/**
 * Workers runtime capabilities
 */
const WORKERS_CAPABILITIES: RuntimeCapabilities = {
  name: 'workers',
  fileSystem: false,
  childProcess: false,
  tcpSocket: false,
  websocket: true,
  supportedMCPTypes: ['remote'],
};

/**
 * Workers Platform implementation
 */
export class WorkersPlatform implements Platform {
  readonly capabilities: RuntimeCapabilities;
  readonly storage: Storage;
  readonly events: EventBus;
  readonly transport: MCPTransport;
  readonly logger: Logger;
  readonly crypto: Crypto;
  readonly process: ProcessRunner;

  constructor(
    storage: Storage,
    events: EventBus,
    transport: MCPTransport,
    logger: Logger,
    crypto: Crypto,
    process: ProcessRunner,
  ) {
    this.capabilities = WORKERS_CAPABILITIES;
    this.storage = storage;
    this.events = events;
    this.transport = transport;
    this.logger = logger;
    this.crypto = crypto;
    this.process = process;
  }
}

/**
 * Workers-specific platform configuration
 */
export interface WorkersPlatformConfig extends PlatformConfig {
  kv?: KVNamespace; // Cloudflare KV namespace for storage (deprecated)
  kvNamespaces?: {
    config?: KVNamespace;
    sessions?: KVNamespace;
  };
}

/**
 * Create a Workers platform instance
 */
export async function createWorkersPlatform(
  config?: WorkersPlatformConfig,
): Promise<Platform> {
  // Create storage - use KV if provided, otherwise memory storage
  let storage: Storage;
  if (config?.kvNamespaces) {
    storage = new WorkersKVStorage({
      configNamespace: config.kvNamespaces.config,
      sessionNamespace: config.kvNamespaces.sessions,
    });
  } else if (config?.kv) {
    // Backward compatibility
    storage = new KVStorage(config.kv);
  } else {
    storage = new WorkersMemoryStorage();
  }

  // Create event bus
  const events = new WorkersEventBus();

  // Create transport
  const transport = new WorkersMCPTransport();

  // Create logger
  const logger = new WorkersLogger(config?.logger?.level ?? 'info');

  // Create crypto
  const crypto = new WorkersCrypto();

  // Create process runner (stub for Workers)
  const process = new WorkersProcessRunner();

  return new WorkersPlatform(
    storage,
    events,
    transport,
    logger,
    crypto,
    process,
  );
}

export { WorkersCrypto } from './crypto.js';
export { WorkersEventBus } from './events.js';
export { WorkersKVStorage } from './kv-storage.js';
export { WorkersLogger } from './logger.js';
export { WorkersProcessRunner } from './process.js';
// Export individual implementations for direct use
export { KVStorage, WorkersMemoryStorage } from './storage.js';
export { WorkersMCPTransport } from './transport.js';
