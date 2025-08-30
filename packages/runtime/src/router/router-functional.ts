/**
 * Pure functional router utilities
 */

import type {
  RouteDecision,
  RouterConfig,
  RouteTarget,
} from './router-types.js';

/**
 * Generate public name with namespace
 */
export function generatePublicName(
  serverId: string,
  originalName: string,
  config: RouterConfig = {},
): string {
  const strategy = config.namingStrategy || 'namespace';
  const separator = config.separator || '_';

  if (strategy === 'none') {
    return originalName;
  }

  if (strategy === 'prefix') {
    return `${serverId}${separator}${originalName}`;
  }

  if (strategy === 'suffix') {
    return `${originalName}${separator}${serverId}`;
  }

  // Default: namespace strategy (prefix-based)
  return `${serverId}${separator}${originalName}`;
}

/**
 * Parse public name to extract server ID and original name
 */
export function parsePublicName(
  publicName: string,
  config: RouterConfig = {},
): { serverId?: string; originalName: string } {
  const strategy = config.namingStrategy || 'namespace';
  const separator = config.separator || '_';

  if (strategy === 'none') {
    return { originalName: publicName };
  }

  const parts = publicName.split(separator);

  if (strategy === 'prefix' && parts.length > 1) {
    return {
      serverId: parts[0],
      originalName: parts.slice(1).join(separator),
    };
  }

  if (strategy === 'suffix' && parts.length > 1) {
    return {
      serverId: parts[parts.length - 1],
      originalName: parts.slice(0, -1).join(separator),
    };
  }

  // namespace strategy (prefix-based)
  if (parts.length > 1) {
    return {
      serverId: parts[0],
      originalName: parts.slice(1).join(separator),
    };
  }

  return { originalName: publicName };
}

/**
 * Resolve route for a given public name
 */
export function resolveRoute(
  publicName: string,
  resolver: (name: string) => RouteTarget | null,
  _config: RouterConfig = {},
  resolvedBy: string = 'registry',
): RouteDecision {
  try {
    const target = resolver(publicName);

    if (!target) {
      const entityType = resolvedBy.replace('Registry', '');
      const capitalizedType =
        entityType.charAt(0).toUpperCase() + entityType.slice(1);
      return {
        found: false,
        target: null,
        error: `${capitalizedType} not found: ${publicName}`,
      };
    }

    return {
      found: true,
      target,
      metadata: {
        publicName,
        resolvedBy,
      },
    };
  } catch (error) {
    return {
      found: false,
      target: null,
      error: error instanceof Error ? error.message : 'Unknown routing error',
    };
  }
}

/**
 * Batch resolve multiple routes
 */
export function batchResolveRoutes<T extends string>(
  names: T[],
  resolver: (name: string) => RouteTarget | null,
  config: RouterConfig = {},
): Map<T, RouteDecision> {
  const results = new Map<T, RouteDecision>();

  for (const name of names) {
    results.set(name, resolveRoute(name, resolver, config));
  }

  return results;
}

/**
 * Filter routes by server ID
 */
export function filterByServer<T extends { serverId: string }>(
  items: T[],
  serverId: string,
): T[] {
  return items.filter((item) => item.serverId === serverId);
}

/**
 * Group routes by server ID
 */
export function groupByServer<T extends { serverId: string }>(
  items: T[],
): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const group = groups.get(item.serverId) || [];
    group.push(item);
    groups.set(item.serverId, group);
  }

  return groups;
}
