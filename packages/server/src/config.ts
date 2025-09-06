/**
 * Configuration Loader
 *
 * Loads and validates configuration files.
 * Supports JSON and JSONC (with comments).
 * Uses Zod for runtime validation.
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import {
  expandConfig,
  formatConfigError,
  type HatagoConfig,
  safeParseConfig,
  validateEnvironmentVariables
} from '@himorishige/hatago-core';
import { deepMerge } from './utils/deep-merge.js';
import { resolveConfigPath } from './utils/path-resolver.js';
import type { Logger } from './logger.js';

/**
 * Load configuration from file
 * @returns Validated configuration with metadata
 */
export async function loadConfig(
  configPath: string,
  logger: Logger
): Promise<{
  path: string;
  exists: boolean;
  data: HatagoConfig;
}> {
  // Resolve path relative to CWD
  const absolutePath = isAbsolute(configPath) ? configPath : resolve(process.cwd(), configPath);

  // Check if file exists (optional)
  if (!existsSync(absolutePath)) {
    logger.debug(`Config file not found: ${absolutePath}, using defaults`);

    // Return validated defaults
    const defaultConfig = safeParseConfig({});
    if (!defaultConfig.success) {
      // This should never happen with empty object
      throw new Error('Failed to create default configuration');
    }

    return {
      path: absolutePath,
      exists: false,
      data: defaultConfig.data
    };
  }

  try {
    // Load configuration with inheritance support
    const rawData = await loadConfigWithExtends(absolutePath, logger);

    // First validate that all required environment variables are present
    try {
      validateEnvironmentVariables(rawData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      // Print concise message without stack trace
      logger.error(`Environment variable validation failed: ${message}`);
      // Re-throw a plain Error with only the message so upstream handlers can render succinctly
      throw new Error(message);
    }

    // Expand environment variables
    const expandedData = expandConfig(rawData as Record<string, unknown>);

    // Validate expanded configuration with Zod
    const parseResult = safeParseConfig(expandedData);

    if (!parseResult.success) {
      // Format error for human readability
      const errorMessage = formatConfigError(parseResult.error);
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    logger.debug(`Loaded, expanded, and validated config from ${absolutePath}`);

    return {
      path: absolutePath,
      exists: true,
      data: parseResult.data
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // Keep logger signature (message, Error) for tests, but avoid noisy stacks in CLI by rethrowing a plain Error below
    logger.error(`Failed to load config from ${absolutePath}:`, error as Error);

    // Re-throw with better message
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }

    // Re-throw a plain Error with concise message so CLI can print without stack
    throw new Error(message);
  }
}

/**
 * Strip comments from JSONC content
 */
function stripJsonComments(content: string): string {
  // Remove single-line comments (but not inside strings)
  content = content.replace(/("(?:[^"\\]|\\.)*")|\/\/.*$/gm, '$1');

  // Remove multi-line comments (but not inside strings)
  content = content.replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\//g, '$1');

  // Remove trailing commas before } or ]
  content = content.replace(/,(\s*[}\]])/g, '$1');

  return content;
}

/**
 * Load configuration with inheritance support
 *
 * @param configPath Path to configuration file
 * @param logger Logger instance
 * @param visited Set of visited paths for circular reference detection
 * @param depth Current inheritance depth
 * @returns Loaded and merged configuration
 */
async function loadConfigWithExtends(
  configPath: string,
  logger: Logger,
  visited: Set<string> = new Set(),
  depth = 0
): Promise<unknown> {
  const MAX_DEPTH = 10;

  // Resolve path (expand ~, resolve relative paths, get realpath)
  const resolvedPath = resolveConfigPath(configPath, Array.from(visited).pop());

  // Check for circular references
  if (visited.has(resolvedPath)) {
    const chain = Array.from(visited).concat(resolvedPath).join(' → ');
    throw new Error(`Circular reference detected in configuration inheritance: ${chain}`);
  }

  // Check maximum depth
  if (depth > MAX_DEPTH) {
    throw new Error(`Maximum configuration inheritance depth (${MAX_DEPTH}) exceeded`);
  }

  // Check if file exists
  if (!existsSync(resolvedPath)) {
    throw new Error(`Configuration file not found: ${resolvedPath}`);
  }

  // Read and parse file
  const content = await readFile(resolvedPath, 'utf-8');
  const jsonContent = stripJsonComments(content);
  let rawConfig: Record<string, unknown>;

  try {
    rawConfig = JSON.parse(jsonContent) as Record<string, unknown>;
  } catch (error) {
    throw new Error(
      `Invalid JSON in configuration file ${resolvedPath}: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  // Process extends field if present
  let baseConfig: unknown = {};
  const extendsField = rawConfig.extends;

  if (extendsField) {
    const parentPaths = Array.isArray(extendsField) ? extendsField : [extendsField];

    // Add current path to visited set for child recursions
    // This prevents circular references by tracking the inheritance chain
    // The Set is passed by reference, so all recursive calls share the same tracking
    visited.add(resolvedPath);

    for (const parentPath of parentPaths) {
      if (typeof parentPath !== 'string') {
        throw new Error(
          `Invalid extends value in ${resolvedPath}: must be a string or array of strings`
        );
      }

      logger.debug(`Loading parent configuration from ${parentPath}`);

      // Pass the same visited set (already contains current path)
      const parentConfig = await loadConfigWithExtends(parentPath, logger, visited, depth + 1);

      baseConfig = deepMerge(baseConfig, parentConfig);
    }

    // Remove current path after processing all parents
    visited.delete(resolvedPath);
  }

  // Remove extends field from current config and merge
  const currentConfig: Record<string, unknown> = { ...rawConfig };
  delete currentConfig.extends;
  const merged = deepMerge(baseConfig, currentConfig);

  return merged;
}
