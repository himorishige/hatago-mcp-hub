/**
 * Pure functional routing logic
 * Stateless functions for name resolution and server selection
 */

import type { ToolNamingStrategy } from '../config/types.js';
import type {
  RegistryState,
  RouteDecision,
  RouterContext,
  RouteTarget,
} from './mcp-router-types.js';

/**
 * Parse a public name to extract the original name and server ID
 * Supports multiple naming strategies
 */
export function parsePublicName(
  publicName: string,
  strategy: ToolNamingStrategy = 'namespace',
  separator = '_',
): RouteTarget | null {
  switch (strategy) {
    case 'namespace': {
      // Server ID is suffix: toolName_serverId
      const lastSeparatorIndex = publicName.lastIndexOf(separator);
      if (lastSeparatorIndex === -1) return null;

      return {
        originalName: publicName.substring(0, lastSeparatorIndex),
        serverId: publicName.substring(lastSeparatorIndex + separator.length),
      };
    }

    case 'alias': {
      // Server ID is prefix: serverId_toolName
      const firstSeparatorIndex = publicName.indexOf(separator);
      if (firstSeparatorIndex === -1) return null;

      return {
        serverId: publicName.substring(0, firstSeparatorIndex),
        originalName: publicName.substring(
          firstSeparatorIndex + separator.length,
        ),
      };
    }

    case 'error': {
      // No namespace, return as-is (will likely cause errors if duplicates exist)
      return null;
    }

    default:
      return null;
  }
}

/**
 * Generate a public name from server ID and original name
 */
export function generatePublicName(
  serverId: string,
  originalName: string,
  strategy: ToolNamingStrategy = 'namespace',
  separator = '_',
): string {
  switch (strategy) {
    case 'namespace':
      // Append server ID as suffix
      return `${originalName}${separator}${serverId}`;

    case 'alias':
      // Prepend server ID as prefix
      return `${serverId}${separator}${originalName}`;

    case 'error':
      // No modification
      return originalName;

    default:
      // Default to namespace strategy
      return `${originalName}${separator}${serverId}`;
  }
}

/**
 * Resolve a public name to routing information using registry state
 * Pure function that doesn't depend on external state
 */
export function resolveRoute(
  publicName: string,
  registryState: RegistryState,
  strategy: ToolNamingStrategy = 'namespace',
  separator = '_',
): RouteDecision<RouteTarget> {
  // First, try direct lookup in registry
  const entry = registryState.get(publicName);
  if (entry) {
    return {
      target: {
        serverId: entry.serverId,
        originalName: entry.originalName,
      },
    };
  }

  // If not found, try to parse the public name
  const parsed = parsePublicName(publicName, strategy, separator);
  if (parsed) {
    // Verify the parsed result exists in registry
    // (to prevent routing to non-existent servers)
    const expectedPublicName = generatePublicName(
      parsed.serverId,
      parsed.originalName,
      strategy,
      separator,
    );

    if (registryState.has(expectedPublicName)) {
      return { target: parsed };
    }
  }

  // Not found
  return {
    target: null,
    error: `Unable to resolve route for: ${publicName}`,
  };
}

/**
 * Select a server from multiple candidates
 * Currently simple (first available), but extensible for future strategies
 */
export function selectServer(
  candidates: RouteTarget[],
  _context?: RouterContext,
): RouteTarget | null {
  if (candidates.length === 0) {
    return null;
  }

  // Simple strategy: return first available
  // In the future, could use context to implement:
  // - Load balancing
  // - Affinity routing
  // - Health-based selection
  return candidates[0];
}

/**
 * Filter candidates based on context
 * Pure function for filtering available targets
 */
export function filterCandidates(
  candidates: RouteTarget[],
  _context?: RouterContext,
): RouteTarget[] {
  // Currently no filtering, but this is where we could add:
  // - Capability-based filtering
  // - Permission-based filtering
  // - Version-based filtering

  return candidates;
}

/**
 * Create a route decision from candidates
 * Combines filtering and selection into a single decision
 */
export function makeRouteDecision(
  candidates: RouteTarget[],
  context?: RouterContext,
): RouteDecision<RouteTarget> {
  const filtered = filterCandidates(candidates, context);
  const selected = selectServer(filtered, context);

  if (!selected) {
    return {
      target: null,
      error: 'No suitable target found',
      metadata: {
        candidatesCount: candidates.length,
        filteredCount: filtered.length,
      },
    };
  }

  return {
    target: selected,
    metadata: {
      candidatesCount: candidates.length,
      filteredCount: filtered.length,
    },
  };
}
