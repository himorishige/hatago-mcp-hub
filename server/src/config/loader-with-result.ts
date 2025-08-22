/**
 * Config loader with Result pattern
 * Demonstrates improved error handling using functional programming
 */

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse } from 'jsonc-parser';
import type { Logger } from 'pino';
import { ErrorHelpers } from '../utils/errors.js';
import { err, ok, type Result, tryCatchAsync } from '../utils/result.js';
import { applyDefaults, deepMerge } from './defaults.js';
import { expandEnvVariables } from './env-expander.js';
import type { HatagoConfig } from './types.js';
import { validateConfig } from './validator.js';

/**
 * Configuration loading options
 */
export interface LoadConfigOptions {
  quiet?: boolean;
  profile?: string;
  logger?: Logger;
}

/**
 * Validate profile name
 */
const validateProfileName = (profile: string): Result<string> => {
  if (!/^[a-zA-Z0-9_-]+$/.test(profile)) {
    return err(
      ErrorHelpers.invalidInput(
        'profile name',
        `${profile} - Only alphanumeric characters, hyphens, and underscores are allowed`,
      ),
    );
  }
  return ok(profile);
};

/**
 * Get config file path
 */
const getConfigPath = (
  configPath?: string,
  profile?: string,
): Result<string | undefined> => {
  // If profile is specified and not default
  if (profile && profile !== 'default') {
    const validationResult = validateProfileName(profile);
    if (!validationResult.ok) {
      return validationResult as Result<never>;
    }

    const profilePath = join(
      process.cwd(),
      '.hatago',
      'profiles',
      `${profile}.jsonc`,
    );
    return ok(profilePath);
  }

  // Use provided path or search for default
  if (configPath) {
    return ok(configPath);
  }

  // Search for config files
  const searchPaths = [
    '.hatago/config.jsonc',
    '.hatago/config.json',
    'hatago.config.jsonc',
    'hatago.config.json',
    '.hatago.jsonc',
    '.hatago.json',
  ];

  const foundPath = searchPaths.find((path) =>
    existsSync(join(process.cwd(), path)),
  );

  return ok(foundPath ? join(process.cwd(), foundPath) : undefined);
};

/**
 * Read and parse config file
 */
const readConfigFile = async (path: string): Promise<Result<unknown>> => {
  return tryCatchAsync(
    async () => {
      const content = await readFile(path, 'utf-8');
      return parse(content);
    },
    (error) => ErrorHelpers.configLoadFailed(path, error),
  );
};

/**
 * Process raw config data
 */
const processConfig = (
  rawConfig: unknown,
  _options?: LoadConfigOptions,
): Result<HatagoConfig> => {
  // Apply environment variable expansion
  const expandedConfig = expandEnvVariables(rawConfig);

  // Apply defaults
  const withDefaults = applyDefaults(expandedConfig);

  // Validate and return
  try {
    const validated = validateConfig(withDefaults);
    return ok(validated);
  } catch (error) {
    return err(ErrorHelpers.createErrorFromUnknown(error));
  }
};

/**
 * Create default config
 */
const createDefaultConfig = (): Result<HatagoConfig> => {
  try {
    const config = validateConfig({
      version: 1,
      logLevel: 'info',
      http: {
        port: 3000,
        host: 'localhost',
      },
      toolNaming: {
        strategy: 'namespace',
        separator: '_',
        format: '{serverId}_{toolName}',
      },
      session: {
        ttlSeconds: 3600,
        persist: false,
        store: 'memory',
      },
      timeouts: {
        spawnMs: 8000,
        healthcheckMs: 2000,
        toolCallMs: 20000,
      },
      concurrency: {
        global: 8,
      },
      security: {
        redactKeys: ['password', 'apiKey', 'token', 'secret'],
      },
      servers: [],
    });
    return ok(config);
  } catch (error) {
    return err(ErrorHelpers.createErrorFromUnknown(error));
  }
};

/**
 * Load configuration with Result pattern
 */
export async function loadConfigWithResult(
  configPath?: string,
  options?: LoadConfigOptions,
): Promise<Result<HatagoConfig>> {
  const logger = options?.logger;

  // Get config file path
  const pathResult = getConfigPath(configPath, options?.profile);
  if (!pathResult.ok) {
    return pathResult;
  }

  const resolvedPath = pathResult.value;

  // If no config file found, use default
  if (!resolvedPath) {
    if (!options?.quiet && logger) {
      logger.info('No config file found, using default configuration');
    }
    return createDefaultConfig();
  }

  // Check if file exists
  if (!existsSync(resolvedPath)) {
    if (configPath) {
      // Explicit path was provided but doesn't exist
      return err(ErrorHelpers.configLoadFailed(resolvedPath, 'File not found'));
    }
    // Fall back to default
    return createDefaultConfig();
  }

  if (!options?.quiet && logger) {
    logger.info(`Loading config from: ${resolvedPath}`);
  }

  // Read and process config file
  const fileResult = await readConfigFile(resolvedPath);
  if (!fileResult.ok) {
    return fileResult as Result<never>;
  }

  const configResult = processConfig(fileResult.value, options);

  if (configResult.ok && !options?.quiet && logger) {
    logger.info('Config loaded successfully');
  }

  return configResult;
}

/**
 * Load config with multiple fallbacks
 */
export async function loadConfigWithFallbacks(
  paths: string[],
  options?: LoadConfigOptions,
): Promise<Result<HatagoConfig>> {
  for (const path of paths) {
    const result = await loadConfigWithResult(path, options);
    if (result.ok) {
      return result;
    }
    // Continue to next path on error
  }

  // All paths failed, return default
  return createDefaultConfig();
}

/**
 * Merge multiple configs
 */
export function mergeConfigs(
  base: HatagoConfig,
  ...overrides: Partial<HatagoConfig>[]
): Result<HatagoConfig> {
  try {
    let merged = base;
    for (const override of overrides) {
      merged = deepMerge(merged, override) as HatagoConfig;
    }
    const validated = validateConfig(merged);
    return ok(validated);
  } catch (error) {
    return err(ErrorHelpers.createErrorFromUnknown(error));
  }
}
