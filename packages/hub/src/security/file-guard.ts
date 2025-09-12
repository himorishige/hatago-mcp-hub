// v0.3.0 Breaking: legacy path removed.
const MSG = [
  'Removed in v0.3.0: @himorishige/hatago-hub/security/file-guard',
  'Use @himorishige/hatago-hub-management/file-guard.js instead.',
  '— v0.3.0 で旧パスは削除されました。移行先: @himorishige/hatago-hub-management/file-guard.js'
].join(' ');

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class FileAccessGuard {
  constructor(..._args: unknown[]) {}
}
