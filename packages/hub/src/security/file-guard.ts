// v0.0.12 Breaking: legacy path removed.
const MSG =
  'Removed in v0.0.12: @himorishige/hatago-hub/security/file-guard. Use @himorishige/hatago-hub-management/file-guard.js instead.';

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class FileAccessGuard {
  constructor(..._args: unknown[]) {}
}
