// v0.0.12 Breaking: legacy path removed.
const MSG =
  'Removed in v0.0.12: @himorishige/hatago-hub/mcp-server/idle-manager. Use @himorishige/hatago-hub-management/idle-manager.js instead.';

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class IdleManager {
  constructor(..._args: unknown[]) {}
}
