// v0.3.0 Breaking: legacy path removed.
const MSG = [
  'Removed in v0.3.0: @himorishige/hatago-hub/mcp-server/state-machine',
  'Use @himorishige/hatago-hub-management/state-machine.js instead.',
  '— v0.3.0 で旧パスは削除されました。移行先: @himorishige/hatago-hub-management/state-machine.js'
].join(' ');

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class ServerStateMachine {
  constructor(..._args: unknown[]) {}
}
