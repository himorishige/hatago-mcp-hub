/**
 * Hatago MCP Hub Lite
 *
 * Minimal entry point with only core features.
 * Enterprise features are available via conditional imports.
 */

// Core exports
export * from './core/mcp-hub.js';
export * from './core/resource-registry.js';
export * from './core/tool-registry.js';
export * from './core/session-manager.js';

// Configuration
export * from './config/loader.js';
export * from './config/types.js';

// Transport
export * from './transport/index.js';
export * from './transport/stdio.js';

// Servers
export * from './servers/npx-mcp-server.js';
export * from './servers/remote-mcp-server.js';

// Basic utilities
export * from './utils/errors.js';
export * from './utils/result.js';

// Proxy layer (simplified)
export { NameResolver, ServerNode } from './proxy/index.js';

// Composition layer (core hub)
export { HatagoHub as HatagoHubLite } from './composition/hub.js';
export type { 
  CompositionManifest,
  ServerConfig,
  TransportConfig,
  MountOptions,
  ImportOptions 
} from './composition/types.js';

/**
 * Check if enterprise features are available
 */
export async function hasEnterpriseFeatures(): Promise<boolean> {
  try {
    await import('./observability/index.js');
    return true;
  } catch {
    return false;
  }
}

/**
 * Conditionally load enterprise features
 */
export async function loadEnterpriseFeatures() {
  try {
    const [observability, security, codegen, integrations] = await Promise.all([
      import('./observability/index.js'),
      import('./security/index.js'),
      import('./codegen/index.js'),
      import('./integrations/index.js'),
    ]);
    
    return {
      observability,
      security,
      codegen,
      integrations,
      available: true,
    };
  } catch (error) {
    return {
      observability: null,
      security: null,
      codegen: null,
      integrations: null,
      available: false,
      error,
    };
  }
}