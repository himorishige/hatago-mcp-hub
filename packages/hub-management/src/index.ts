// Re-export management components from @himorishige/hatago-hub for migration.
// This allows gradual extraction without breaking existing users. [PEC]

export { ActivationManager } from './activation-manager.js';
export { ServerStateMachine } from './state-machine.js';
export { IdleManager } from './idle-manager.js';
export { MetadataStore } from './metadata-store.js';
export { AuditLogger } from './audit-logger.js';
export type { StoredServerMetadata } from './metadata-store.js';
// Other management components will be migrated in subsequent steps.
