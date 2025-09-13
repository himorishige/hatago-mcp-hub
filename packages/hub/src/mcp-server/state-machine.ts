// v0.0.12 Breaking: legacy path removed.
const MSG =
  'Removed in v0.0.12: @himorishige/hatago-hub/mcp-server/state-machine. Use @himorishige/hatago-hub-management/state-machine.js instead.';

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class ServerStateMachine {
  constructor(..._args: unknown[]) {}
}
