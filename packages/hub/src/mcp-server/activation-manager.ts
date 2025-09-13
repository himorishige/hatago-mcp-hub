// v0.0.12 Breaking: legacy path removed.
// Thin stub that throws on import with migration hint. [PEC][SD]
const MSG =
  'Removed in v0.0.12: @himorishige/hatago-hub/mcp-server/activation-manager. Use @himorishige/hatago-hub-management/activation-manager.js instead.';

throw new Error(MSG);

// Provide a minimal type surface so type-only imports do not crash TS. [ISA]

export class ActivationManager {
  constructor(..._args: unknown[]) {}
}
