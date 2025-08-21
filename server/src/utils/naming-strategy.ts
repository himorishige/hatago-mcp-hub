/**
 * Naming strategy utilities for tools and resources
 * Pure functions for generating public names based on naming configuration
 */

import type { ToolNamingConfig, ToolNamingStrategy } from '../config/types.js';

/**
 * Generate a public name for a tool or resource based on the naming strategy
 * @param serverId The server ID
 * @param originalName The original tool/resource name or URI
 * @param strategy The naming strategy to use
 * @param separator The separator character (default: '_')
 * @returns The public name
 */
export function generatePublicName(
  serverId: string,
  originalName: string,
  strategy: ToolNamingStrategy,
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
      // Default to namespace strategy for unknown strategies
      return `${originalName}${separator}${serverId}`;
  }
}

/**
 * Parse a public name to extract the original name and server ID
 * @param publicName The public name to parse
 * @param strategy The naming strategy used
 * @param separator The separator character (default: '_')
 * @returns The original name and server ID, or null if unable to parse
 */
export function parsePublicName(
  publicName: string,
  strategy: ToolNamingStrategy,
  separator = '_',
): { originalName: string; serverId: string } | null {
  switch (strategy) {
    case 'namespace': {
      // Server ID is suffix
      const lastSeparatorIndex = publicName.lastIndexOf(separator);
      if (lastSeparatorIndex === -1) return null;
      return {
        originalName: publicName.substring(0, lastSeparatorIndex),
        serverId: publicName.substring(lastSeparatorIndex + separator.length),
      };
    }
    case 'alias': {
      // Server ID is prefix
      const firstSeparatorIndex = publicName.indexOf(separator);
      if (firstSeparatorIndex === -1) return null;
      return {
        serverId: publicName.substring(0, firstSeparatorIndex),
        originalName: publicName.substring(
          firstSeparatorIndex + separator.length,
        ),
      };
    }
    case 'error':
      // No modification, can't extract server ID
      return null;
    default:
      return null;
  }
}

/**
 * Create a naming function with a specific configuration
 * @param config The naming configuration
 * @returns A function that generates public names
 */
export function createNamingFunction(config: ToolNamingConfig) {
  return (serverId: string, originalName: string) =>
    generatePublicName(
      serverId,
      originalName,
      config.strategy,
      config.separator || '_',
    );
}

/**
 * Create a parsing function with a specific configuration
 * @param config The naming configuration
 * @returns A function that parses public names
 */
export function createParsingFunction(config: ToolNamingConfig) {
  return (publicName: string) =>
    parsePublicName(publicName, config.strategy, config.separator || '_');
}
