/**
 * Hatago Plugin API
 * Minimal plugin system for extending functionality
 */

import type { Command } from 'commander';
import type { Hono } from 'hono';

/**
 * Plugin metadata
 */
export interface PluginMetadata {
  name: string;
  version: string;
  description?: string;
  activationEvents?: string[];
  dependencies?: string[];
}

/**
 * Plugin lifecycle hooks
 */
export interface PluginHooks {
  onStart?: () => void | Promise<void>;
  onStop?: () => void | Promise<void>;
  onRequest?: (req: Request) => void | Promise<void>;
  onError?: (error: Error) => void | Promise<void>;
}

/**
 * Plugin providers
 */
export interface PluginProviders {
  provideCommands?: () => Command[];
  provideRoutes?: () => Array<{ path: string; handler: any }>;
  provideMiddleware?: () => Array<(app: Hono) => void>;
}

/**
 * Main plugin interface
 */
export interface HatagoPlugin {
  metadata: PluginMetadata;
  setup(core: HatagoCore): PluginHooks & PluginProviders;
  activate?: () => Promise<void>;
  deactivate?: () => Promise<void>;
}

/**
 * Core interface exposed to plugins
 */
export interface HatagoCore {
  version: string;
  config: any;
  logger: {
    info: (message: string) => void;
    warn: (message: string) => void;
    error: (message: string) => void;
    debug: (message: string) => void;
  };
  getService: <T>(name: string) => T | undefined;
  registerService: (name: string, service: any) => void;
}

/**
 * Plugin manager
 */
export class PluginManager {
  private plugins = new Map<string, HatagoPlugin>();
  private hooks = new Map<string, Array<(...args: any[]) => any>>();
  private services = new Map<string, any>();
  private activated = new Set<string>();

  constructor(private core: HatagoCore) {}

  /**
   * Register a plugin
   */
  async register(plugin: HatagoPlugin): Promise<void> {
    const { name } = plugin.metadata;
    
    if (this.plugins.has(name)) {
      throw new Error(`Plugin ${name} is already registered`);
    }

    this.plugins.set(name, plugin);

    // Setup plugin and collect hooks
    const result = plugin.setup(this.core);
    
    // Register hooks
    if (result.onStart) {
      this.addHook('start', result.onStart);
    }
    if (result.onStop) {
      this.addHook('stop', result.onStop);
    }
    if (result.onRequest) {
      this.addHook('request', result.onRequest);
    }
    if (result.onError) {
      this.addHook('error', result.onError);
    }

    // Register providers
    if (result.provideCommands) {
      this.services.set(`${name}:commands`, result.provideCommands());
    }
    if (result.provideRoutes) {
      this.services.set(`${name}:routes`, result.provideRoutes());
    }
    if (result.provideMiddleware) {
      this.services.set(`${name}:middleware`, result.provideMiddleware());
    }
  }

  /**
   * Load plugin dynamically
   */
  async loadPlugin(modulePath: string): Promise<void> {
    try {
      const module = await import(modulePath);
      const PluginClass = module.default || module.Plugin;
      
      if (!PluginClass) {
        throw new Error(`No plugin exported from ${modulePath}`);
      }

      const plugin = new PluginClass();
      await this.register(plugin);
    } catch (error) {
      // Plugin not available - this is ok for optional dependencies
      this.core.logger.debug(`Plugin ${modulePath} not available: ${error}`);
    }
  }

  /**
   * Activate a plugin
   */
  async activate(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (this.activated.has(name)) {
      return; // Already activated
    }

    if (plugin.activate) {
      await plugin.activate();
    }

    this.activated.add(name);
    await this.callHook('start');
  }

  /**
   * Deactivate a plugin
   */
  async deactivate(name: string): Promise<void> {
    const plugin = this.plugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} not found`);
    }

    if (!this.activated.has(name)) {
      return; // Not activated
    }

    await this.callHook('stop');

    if (plugin.deactivate) {
      await plugin.deactivate();
    }

    this.activated.delete(name);
  }

  /**
   * Get plugin commands
   */
  getCommands(): Command[] {
    const commands: Command[] = [];
    
    for (const [key, value] of this.services) {
      if (key.endsWith(':commands') && Array.isArray(value)) {
        commands.push(...value);
      }
    }
    
    return commands;
  }

  /**
   * Get plugin routes
   */
  getRoutes(): Array<{ path: string; handler: any }> {
    const routes: Array<{ path: string; handler: any }> = [];
    
    for (const [key, value] of this.services) {
      if (key.endsWith(':routes') && Array.isArray(value)) {
        routes.push(...value);
      }
    }
    
    return routes;
  }

  /**
   * Get plugin middleware
   */
  getMiddleware(): Array<(app: Hono) => void> {
    const middleware: Array<(app: Hono) => void> = [];
    
    for (const [key, value] of this.services) {
      if (key.endsWith(':middleware') && Array.isArray(value)) {
        middleware.push(...value);
      }
    }
    
    return middleware;
  }

  /**
   * Add hook
   */
  private addHook(event: string, handler: (...args: any[]) => any): void {
    if (!this.hooks.has(event)) {
      this.hooks.set(event, []);
    }
    this.hooks.get(event)!.push(handler);
  }

  /**
   * Call hooks
   */
  async callHook(event: string, ...args: any[]): Promise<void> {
    const handlers = this.hooks.get(event) || [];
    
    for (const handler of handlers) {
      try {
        await handler(...args);
      } catch (error) {
        this.core.logger.error(`Hook ${event} failed: ${error}`);
      }
    }
  }

  /**
   * Check if plugin is available
   */
  hasPlugin(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Check if plugin is activated
   */
  isActivated(name: string): boolean {
    return this.activated.has(name);
  }
}

/**
 * Create a simple console logger
 */
export function createConsoleLogger() {
  return {
    info: (message: string) => console.log(`[INFO] ${message}`),
    warn: (message: string) => console.warn(`[WARN] ${message}`),
    error: (message: string) => console.error(`[ERROR] ${message}`),
    debug: (message: string) => console.log(`[DEBUG] ${message}`),
  };
}