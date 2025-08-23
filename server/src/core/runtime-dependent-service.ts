/**
 * Base class for services that depend on runtime
 * Provides common initialization and shutdown patterns
 */

import { EventEmitter } from 'node:events';
import { getRuntime } from '../runtime/runtime-factory.js';
import type { Runtime } from '../runtime/types.js';
import { ErrorHelpers } from '../utils/errors.js';

/**
 * Abstract base class for services that require runtime initialization
 *
 * This class handles:
 * - Async runtime acquisition during initialization
 * - Null-safe runtime access with automatic error handling
 * - Consistent shutdown patterns
 *
 * Subclasses should implement:
 * - onRuntimeReady(): Initialization logic after runtime is available
 * - onShutdown() (optional): Cleanup logic during shutdown
 */
export abstract class RuntimeDependentService extends EventEmitter {
  protected runtime: Runtime | null = null;

  /**
   * Initialize the service by acquiring runtime and calling subclass initialization
   */
  async initialize(): Promise<void> {
    // Get runtime instance asynchronously
    this.runtime = await getRuntime();

    // Call subclass-specific initialization
    await this.onRuntimeReady(this.runtime);
  }

  /**
   * Called after runtime is successfully acquired
   * Subclasses should implement their initialization logic here
   *
   * @param runtime The initialized runtime instance
   */
  protected abstract onRuntimeReady(runtime: Runtime): Promise<void>;

  /**
   * Get the runtime instance with null checking
   *
   * @returns The runtime instance
   * @throws {Error} If runtime is not initialized
   */
  protected requireRuntime(): Runtime {
    if (!this.runtime) {
      throw ErrorHelpers.notInitialized(this.constructor.name);
    }
    return this.runtime;
  }

  /**
   * Shutdown the service and clean up resources
   */
  async shutdown(): Promise<void> {
    // Call subclass-specific shutdown logic
    await this.onShutdown();

    // Clear runtime reference
    this.runtime = null;
  }

  /**
   * Called during shutdown before runtime is cleared
   * Subclasses can override this to implement cleanup logic
   * Default implementation does nothing
   */
  protected async onShutdown(): Promise<void> {
    // Default: no-op
  }
}
