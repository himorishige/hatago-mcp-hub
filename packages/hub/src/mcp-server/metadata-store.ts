// v0.0.12 Breaking: legacy path removed.
const MSG =
  'Removed in v0.0.12: @himorishige/hatago-hub/mcp-server/metadata-store. Use @himorishige/hatago-hub-management/metadata-store.js instead.';

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class MetadataStore {
  constructor(..._args: unknown[]) {}
}
