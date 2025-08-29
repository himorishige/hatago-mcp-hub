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
  formatConfigError,
  type HatagoConfig,
  safeParseConfig,
} from '@hatago/core/schemas';
import type { Logger } from './logger.js';

/**
 * Load configuration from file
 * @returns Validated configuration with metadata
 */
export async function loadConfig(
  configPath: string,
  logger: Logger,
): Promise<{
  path: string;
  exists: boolean;
  data: HatagoConfig;
}> {
  // Resolve path relative to CWD
  const absolutePath = isAbsolute(configPath)
    ? configPath
    : resolve(process.cwd(), configPath);

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
      data: defaultConfig.data,
    };
  }

  try {
    // Read file
    const content = await readFile(absolutePath, 'utf-8');

    // Parse JSON/JSONC (strip comments)
    const jsonContent = stripJsonComments(content);
    const rawData = JSON.parse(jsonContent);

    // Validate with Zod
    const parseResult = safeParseConfig(rawData);

    if (!parseResult.success) {
      // Format error for human readability
      const errorMessage = formatConfigError(parseResult.error);
      logger.error(errorMessage);
      throw new Error(errorMessage);
    }

    logger.debug(`Loaded and validated config from ${absolutePath}`);

    return {
      path: absolutePath,
      exists: true,
      data: parseResult.data,
    };
  } catch (error) {
    logger.error(`Failed to load config from ${absolutePath}:`, error);

    // Re-throw with better message
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON in configuration file: ${error.message}`);
    }

    throw error;
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
