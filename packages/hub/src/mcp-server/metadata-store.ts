// v0.3.0 Breaking: legacy path removed.
const MSG = [
  'Removed in v0.3.0: @himorishige/hatago-hub/mcp-server/metadata-store',
  'Use @himorishige/hatago-hub-management/metadata-store.js instead.',
  '— v0.3.0 で旧パスは削除されました。移行先: @himorishige/hatago-hub-management/metadata-store.js'
].join(' ');

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class MetadataStore {
  constructor(..._args: unknown[]) {}
}
