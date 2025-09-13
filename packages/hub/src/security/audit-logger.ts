// v0.0.12 Breaking: legacy path removed.
const MSG =
  'Removed in v0.0.12: @himorishige/hatago-hub/security/audit-logger. Use @himorishige/hatago-hub-management/audit-logger.js instead.';

throw new Error(MSG);

// Minimal export for type-only usage. [ISA]

export class AuditLogger {
  constructor(..._args: unknown[]) {}
}
