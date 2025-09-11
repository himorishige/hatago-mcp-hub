/**
 * Minimal Management SPI (Service Provider Interface)
 *
 * Purpose: decouple Hub core from management features (activation/idle/metadata/audit)
 * without changing runtime behavior. Actual implementation will live in a
 * separate internal package and plug via these types. [SF][DM][CA]
 */

export type ManagementEvent =
  | { type: 'activation:start'; serverId: string }
  | { type: 'activation:success'; serverId: string; durationMs?: number }
  | { type: 'activation:failed'; serverId: string; error?: string }
  | { type: 'deactivation:success'; serverId: string }
  | { type: 'state:changed'; serverId: string; from?: string; to: string };

export type ManagementHooks = {
  onEvent?: (event: ManagementEvent) => void | Promise<void>;
};

export type ManagementPlugin = {
  /** Initialize resources (no side effects on Hub core). */
  start(): Promise<void>;
  /** Cleanup timers/resources. */
  stop(): Promise<void>;
};
