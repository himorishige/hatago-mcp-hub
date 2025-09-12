// v0.3.0 Breaking: legacy path removed.
// Thin stub that throws on import with migration hint. [PEC][SD]
const MSG = [
  'Removed in v0.3.0: @himorishige/hatago-hub/mcp-server/activation-manager',
  'Use @himorishige/hatago-hub-management/activation-manager.js instead.',
  '— v0.3.0 で旧パスは削除されました。移行先: @himorishige/hatago-hub-management/activation-manager.js'
].join(' ');

throw new Error(MSG);

// Provide a minimal type surface so type-only imports do not crash TS. [ISA]

export class ActivationManager {
  constructor(..._args: unknown[]) {}
}
