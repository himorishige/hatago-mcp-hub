/**
 * @himorishige/hatago-hub/legacy - Legacy components for backward compatibility
 *
 * These components are deprecated and go against Hatago's "thin implementation" philosophy.
 * They are maintained for backward compatibility but will be removed in future versions.
 *
 * Please migrate to the thin HubCore implementation for better performance and simplicity.
 */

// Management components - These add unnecessary complexity
export { ActivationManager } from '../mcp-server/activation-manager.js';
export { HatagoManagementServer } from '../mcp-server/hatago-management-server.js';
export { IdleManager } from '../mcp-server/idle-manager.js';
export { MetadataStore } from '../mcp-server/metadata-store.js';
export { ServerStateMachine } from '../mcp-server/state-machine.js';

// Security components - Overly complex for a thin hub
export { AuditLogger } from '../security/audit-logger.js';
export { FileAccessGuard } from '../security/file-guard.js';

// Legacy hub implementations with state management
export { HatagoHub } from '../hub.js';
export { EnhancedHatagoHub } from '../enhanced-hub.js';
export type { EnhancedHubOptions } from '../enhanced-hub.js';

// SSE Manager - Complex state management
export { SSEManager } from '../sse-manager.js';

// Notification Manager - Unnecessary abstraction
export { NotificationManager } from '../notification-manager.js';

console.warn(
  '[LEGACY] You are importing from @himorishige/hatago-hub/legacy.\n' +
    'These components are deprecated and will be removed in the next major version.\n' +
    'Please migrate to the default thin implementation (HubCore) for better performance.\n' +
    'Migration guide: https://github.com/himorishige/hatago-mcp-hub/blob/main/docs/migration-to-thin.md'
);
