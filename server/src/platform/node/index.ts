/**
 * Node.js Platform implementation
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
import { WebCrypto } from './crypto.js';
import { NodeEventBus } from './events.js';
import { ConsoleLogger } from './logger.js';
import { NodeProcessRunner } from './process.js';
import { FileStorage, MemoryStorage } from './storage.js';
import { NodeMCPTransport } from './transport.js';

/**
 * Node.js runtime capabilities
 */
const NODE_CAPABILITIES: RuntimeCapabilities = {
  name: 'node',
  fileSystem: true,
  childProcess: true,
  tcpSocket: true,
  websocket: true,
  supportedMCPTypes: ['local', 'npx', 'remote'],
};

/**
 * Node.js Platform implementation
 */
export class NodePlatform implements Platform {
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
    this.capabilities = NODE_CAPABILITIES;
    this.storage = storage;
    this.events = events;
    this.transport = transport;
    this.logger = logger;
    this.crypto = crypto;
    this.process = process;
  }
}

/**
 * Create a Node.js platform instance
 */
export async function createNodePlatform(
  config?: PlatformConfig,
): Promise<Platform> {
  // Create storage
  let storage: Storage;
  if (config?.storage?.type === 'memory') {
    storage = new MemoryStorage();
  } else {
    const path = config?.storage?.path ?? '.hatago/storage';
    storage = new FileStorage(path);
  }

  // Create event bus
  const events = new NodeEventBus();

  // Create transport
  const transport = new NodeMCPTransport();

  // Create logger
  const logger = new ConsoleLogger(
    config?.logger?.level ?? 'info',
    config?.logger?.format ?? 'human',
  );

  // Create crypto
  const crypto = new WebCrypto();

  // Create process runner
  const process = new NodeProcessRunner();

  return new NodePlatform(storage, events, transport, logger, crypto, process);
}

export { NodeCrypto, WebCrypto } from './crypto.js';
export { LightEventBus, NodeEventBus } from './events.js';
export { ConsoleLogger, SilentLogger } from './logger.js';
export { NodeProcessRunner, StubProcessRunner } from './process.js';
// Export individual implementations for direct use
export { FileStorage, MemoryStorage } from './storage.js';
export { NodeMCPTransport } from './transport.js';
