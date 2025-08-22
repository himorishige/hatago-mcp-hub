/**
 * Protocol Version Management
 * Pure functions for version comparison and compatibility checking
 */

// Supported protocol versions in priority order (newest first)
export const SUPPORTED_PROTOCOLS = [
  '2025-06-18', // Latest date-based version
  '0.1.0', // Legacy semantic version
] as const;

export type SupportedProtocol = (typeof SUPPORTED_PROTOCOLS)[number];

/**
 * Check if a protocol version is supported
 */
export function isSupported(version: string): version is SupportedProtocol {
  return SUPPORTED_PROTOCOLS.includes(version as SupportedProtocol);
}

/**
 * Select a compatible protocol version from client's supported versions
 */
export function selectCompatibleVersion(
  clientVersions: string[],
  serverVersions: readonly string[] = SUPPORTED_PROTOCOLS,
): SupportedProtocol | null {
  // Try each server version in priority order
  for (const serverVersion of serverVersions) {
    if (clientVersions.includes(serverVersion)) {
      return serverVersion as SupportedProtocol;
    }
  }
  return null;
}

/**
 * Compare two protocol versions
 * Returns: -1 if v1 < v2, 0 if equal, 1 if v1 > v2
 */
export function compareVersions(v1: string, v2: string): number {
  if (v1 === v2) return 0;

  // Date-based versions (YYYY-MM-DD)
  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (datePattern.test(v1) && datePattern.test(v2)) {
    return v1.localeCompare(v2);
  }

  // Semantic versions (X.Y.Z)
  const semverPattern = /^(\d+)\.(\d+)\.(\d+)$/;
  const v1Match = v1.match(semverPattern);
  const v2Match = v2.match(semverPattern);

  if (v1Match && v2Match) {
    for (let i = 1; i <= 3; i++) {
      const n1 = parseInt(v1Match[i], 10);
      const n2 = parseInt(v2Match[i], 10);
      if (n1 < n2) return -1;
      if (n1 > n2) return 1;
    }
    return 0;
  }

  // Mixed or unknown format - simple string comparison
  return v1.localeCompare(v2);
}

/**
 * Check if a version is date-based (YYYY-MM-DD format)
 */
export function isDateBasedVersion(version: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(version);
}

/**
 * Check if a version is semantic (X.Y.Z format)
 */
export function isSemanticVersion(version: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(version);
}

/**
 * Get the protocol version to use for initialization
 */
export function getInitProtocol(negotiated: SupportedProtocol): string {
  // For backward compatibility, always initialize with the negotiated version
  return negotiated;
}
