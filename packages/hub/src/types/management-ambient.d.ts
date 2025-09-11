/**
 * Ambient type module for '@himorishige/hatago-hub-management'.
 *
 * Purpose: allow type-only imports against the future external package without
 * changing runtime wiring yet. This keeps hub build green while we migrate. [PEC]
 */
declare module '@himorishige/hatago-hub-management' {
  export type {
    ManagementEvent,
    ManagementHooks,
    ManagementPlugin
  } from '../api/management-spi.js';
  export { ServerStateMachine } from '../mcp-server/state-machine.js';
  export { ActivationManager } from '../mcp-server/activation-manager.js';
  export { IdleManager } from '../mcp-server/idle-manager.js';
  export { MetadataStore } from '../mcp-server/metadata-store.js';
  export type { StoredServerMetadata } from '../mcp-server/metadata-store.js';
  export { AuditLogger } from '../security/audit-logger.js';
}
