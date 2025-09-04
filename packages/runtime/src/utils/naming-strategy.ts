/**
 * Naming strategy utilities
 */

import type { ToolNamingConfig } from '../registry/types.js';

/**
 * Create a naming function based on configuration
 */
export function createNamingFunction(config: ToolNamingConfig) {
  return (serverId: string, name: string) => {
    const strategy = config.strategy ?? 'prefix';
    const separator = config.separator ?? '__';

    if (strategy === 'none') {
      return name;
    }

    if (strategy === 'prefix') {
      return `${serverId}${separator}${name}`;
    }

    if (strategy === 'suffix' || strategy === 'namespace') {
      return `${name}${separator}${serverId}`;
    }

    if (strategy === 'alias' && config.aliases) {
      const alias = config.aliases[serverId];
      if (alias) {
        return `${alias}${separator}${name}`;
      }
      return `${serverId}${separator}${name}`;
    }

    return name;
  };
}

/**
 * Create a parsing function based on configuration
 */
export function createParsingFunction(config: ToolNamingConfig) {
  return (publicName: string): { serverId?: string; name: string } => {
    const strategy = config.strategy ?? 'prefix';
    const separator = config.separator ?? '__';

    if (strategy === 'none') {
      return { name: publicName };
    }

    const parts = publicName.split(separator);

    if (strategy === 'prefix' && parts.length > 1) {
      return {
        serverId: parts[0],
        name: parts.slice(1).join(separator)
      };
    }

    if ((strategy === 'suffix' || strategy === 'namespace') && parts.length > 1) {
      return {
        serverId: parts[parts.length - 1],
        name: parts.slice(0, -1).join(separator)
      };
    }

    if (strategy === 'alias' && config.aliases && parts.length > 1) {
      const aliasEntry = Object.entries(config.aliases).find(([_, alias]) => alias === parts[0]);
      if (aliasEntry) {
        return {
          serverId: aliasEntry[0],
          name: parts.slice(1).join(separator)
        };
      }
      return {
        serverId: parts[0],
        name: parts.slice(1).join(separator)
      };
    }

    return { name: publicName };
  };
}
