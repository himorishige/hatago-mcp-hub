/**
 * @himorishige/hatago-hub - User-friendly facade for Hatago MCP Hub
 *
 * This package provides a simplified API for working with MCP servers,
 * tools, and resources.
 */

import type { EnhancedHubOptions } from './enhanced-hub.js';
import { EnhancedHatagoHub } from './enhanced-hub.js';
import { HatagoHub } from './hub.js';
import { HubCoreAdapter } from './hub-core-adapter.js';
import type { IHub } from './hub-interface.js';
import type { HubOptions, ServerSpec } from './types.js';

/**
 * Create a new Hatago Hub instance
 * If a configFile is provided, creates an EnhancedHatagoHub with management features
 */
export function createHub(options?: HubOptions | EnhancedHubOptions): IHub {
  // Check for experimental HubCore flag first
  if (options?.useHubCore) {
    console.info(
      '[EXPERIMENTAL] Using HubCore thin implementation.\n' +
        'This is a minimal, transparent hub without state management or caching.\n' +
        'Report issues at: https://github.com/himorishige/hatago-mcp-hub/issues'
    );
    return new HubCoreAdapter(options);
  }

  // Use EnhancedHatagoHub when config is provided (file or preloaded)
  const hasEnhanced = Boolean(
    (options as EnhancedHubOptions)?.configFile ?? (options as EnhancedHubOptions)?.preloadedConfig
  );
  if (hasEnhanced) {
    console.warn(
      '[DEPRECATION] Implicit EnhancedHatagoHub selection based on configFile/preloadedConfig will be removed in next major version.\n' +
        'Please use explicit opt-in: options.useEnhanced = true\n' +
        'Migration guide: https://github.com/himorishige/hatago-mcp-hub/blob/main/docs/migration-to-thin.md'
    );
    return new EnhancedHatagoHub(options as EnhancedHubOptions);
  }
  return new HatagoHub(options);
}

/**
 * Helper to create a CLI server spec
 */
export function cliServer(
  id: string,
  spec: {
    command: string;
    args?: string[];
    env?: Record<string, string>;
    cwd?: string;
  }
): [string, ServerSpec] {
  return [id, spec];
}

/**
 * Helper to create an HTTP server spec
 */
export function httpServer(
  id: string,
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
): [string, ServerSpec] {
  return [
    id,
    {
      url,
      type: 'http',
      ...options
    }
  ];
}

/**
 * Helper to create an SSE server spec
 */
export function sseServer(
  id: string,
  url: string,
  options?: {
    headers?: Record<string, string>;
    timeout?: number;
  }
): [string, ServerSpec] {
  return [
    id,
    {
      url,
      type: 'sse',
      ...options
    }
  ];
}

export type { EnhancedHubOptions } from './enhanced-hub.js';
// Export enhanced hub with management features
export { EnhancedHatagoHub } from './enhanced-hub.js';
// Export error classes
export {
  ConfigError,
  HatagoError,
  SessionError,
  TimeoutError,
  ToolInvocationError,
  TransportError,
  toHatagoError
} from './errors.js';
// Export main class and types
export { HatagoHub } from './hub.js';
// Export minimal hub interface
export type { IHub } from './hub-interface.js';
// Export experimental thin implementation
export { HubCore } from './hub-core.js';
export { HubCoreAdapter } from './hub-core-adapter.js';
// Export streamable HTTP helpers
export { createEventsEndpoint, handleMCPEndpoint, handleSSEEndpoint } from './hub-streamable.js';
// Management components - DEPRECATED
// These exports will be removed in the next major version
import { ActivationManager as _ActivationManager } from './mcp-server/activation-manager.js';
import { HatagoManagementServer as _HatagoManagementServer } from './mcp-server/hatago-management-server.js';
import { IdleManager as _IdleManager } from './mcp-server/idle-manager.js';
import { MetadataStore as _MetadataStore } from './mcp-server/metadata-store.js';
import { ServerStateMachine as _ServerStateMachine } from './mcp-server/state-machine.js';
import { AuditLogger as _AuditLogger } from './security/audit-logger.js';
import { FileAccessGuard as _FileAccessGuard } from './security/file-guard.js';

// Track if deprecation warnings have been shown
const deprecationWarnings = new Set<string>();

function showDeprecationWarning(component: string) {
  if (!deprecationWarnings.has(component)) {
    deprecationWarnings.add(component);
    console.warn(
      `[DEPRECATION] ${component} is deprecated and will be removed in the next major version.\n` +
        `Please migrate to '@himorishige/hatago-hub/legacy/${component.toLowerCase()}' or consider if this feature is truly needed.\n` +
        'These "thick" features go against Hatago\'s design philosophy of being a thin, transparent hub.\n' +
        'Migration guide: https://github.com/himorishige/hatago-mcp-hub/blob/main/docs/migration-to-thin.md'
    );
  }
}

// Export with deprecation warnings
export const ActivationManager = new Proxy(_ActivationManager, {
  construct(
    target: typeof _ActivationManager,
    args: ConstructorParameters<typeof _ActivationManager>
  ) {
    showDeprecationWarning('ActivationManager');
    return new target(...args);
  }
});

export const HatagoManagementServer = new Proxy(_HatagoManagementServer, {
  construct(
    target: typeof _HatagoManagementServer,
    args: ConstructorParameters<typeof _HatagoManagementServer>
  ) {
    showDeprecationWarning('HatagoManagementServer');
    return new target(...args);
  }
});

export const IdleManager = new Proxy(_IdleManager, {
  construct(target: typeof _IdleManager, args: ConstructorParameters<typeof _IdleManager>) {
    showDeprecationWarning('IdleManager');
    return new target(...args);
  }
});

export const MetadataStore = new Proxy(_MetadataStore, {
  construct(target: typeof _MetadataStore, args: ConstructorParameters<typeof _MetadataStore>) {
    showDeprecationWarning('MetadataStore');
    return new target(...args);
  }
});

export const ServerStateMachine = new Proxy(_ServerStateMachine, {
  construct(
    target: typeof _ServerStateMachine,
    args: ConstructorParameters<typeof _ServerStateMachine>
  ) {
    showDeprecationWarning('ServerStateMachine');
    return new target(...args);
  }
});

export const AuditLogger = new Proxy(_AuditLogger, {
  construct(target: typeof _AuditLogger, args: ConstructorParameters<typeof _AuditLogger>) {
    showDeprecationWarning('AuditLogger');
    return new target(...args);
  }
});

export const FileAccessGuard = new Proxy(_FileAccessGuard, {
  construct(target: typeof _FileAccessGuard, args: ConstructorParameters<typeof _FileAccessGuard>) {
    showDeprecationWarning('FileAccessGuard');
    return new target(...args);
  }
});
export type {
  CallOptions,
  ConnectedServer,
  HubEvent,
  HubEventHandler,
  HubOptions,
  ListOptions,
  ReadOptions,
  ServerSpec
} from './types.js';
