/**
 * Environment variable expansion example for Cloudflare Workers
 *
 * Since process.env doesn't exist in Workers environment,
 * we create a GetEnv function from env bindings
 */

import type { GetEnv } from '@hatago/core';
import { expandConfig, validateEnvironmentVariables } from '@hatago/core';

/**
 * Create GetEnv function for Workers environment
 * Environment variables are retrieved from env bindings
 */
export function createWorkersGetEnv(env: Env): GetEnv {
  return (key: string) => {
    // 1. Check direct env bindings
    if (key in env) {
      const value = (env as Record<string, unknown>)[key];
      if (typeof value === 'string') {
        return value;
      }
    }

    // 2. Check for environment-variable-style keys
    // Example: MY_API_KEY with underscores and uppercase
    const envKey = key.toUpperCase().replace(/-/g, '_');
    if (envKey in env) {
      const value = (env as Record<string, unknown>)[envKey];
      if (typeof value === 'string') {
        return value;
      }
    }

    return undefined;
  };
}

/**
 * Load configuration from KV storage and expand environment variables
 */
export async function loadConfigWithEnvExpansion(
  env: Env,
  configKey: string = 'mcp-servers',
): Promise<unknown> {
  // Get configuration from KV
  const rawConfig = await env.CONFIG_KV.get(configKey, 'json');
  if (!rawConfig) {
    return null;
  }

  // Create GetEnv function for Workers
  const getEnv = createWorkersGetEnv(env);

  // Validate environment variables
  try {
    validateEnvironmentVariables(rawConfig, getEnv);
  } catch (error) {
    console.error('Missing required environment variables:', error);
    throw error;
  }

  // Expand environment variables
  const expandedConfig = expandConfig(rawConfig, getEnv);

  return expandedConfig;
}

/**
 * Usage example: Environment variable expansion in MCP configuration
 *
 * If the following configuration is stored in KV:
 * {
 *   "mcpServers": {
 *     "github": {
 *       "url": "${GITHUB_API_URL:-https://api.github.com}",
 *       "headers": {
 *         "Authorization": "Bearer ${GITHUB_TOKEN}"
 *       }
 *     }
 *   }
 * }
 *
 * And the following env bindings are set in Workers:
 * - GITHUB_TOKEN: "ghp_xxxxxxxxxxxx"
 *
 * Expanded result:
 * {
 *   "mcpServers": {
 *     "github": {
 *       "url": "https://api.github.com",  // Uses default value
 *       "headers": {
 *         "Authorization": "Bearer ghp_xxxxxxxxxxxx"
 *       }
 *     }
 *   }
 * }
 */
export async function exampleUsage(env: Env) {
  try {
    // Load configuration and expand environment variables
    const config = await loadConfigWithEnvExpansion(env);

    if (!config) {
      console.log('No configuration found in KV');
      return;
    }

    console.log('Expanded configuration:', JSON.stringify(config, null, 2));

    // Use expanded configuration to connect to MCP servers
    // ... (actual connection logic here)
  } catch (error) {
    console.error('Failed to load configuration:', error);
  }
}

/**
 * Example environment variable configuration in wrangler.toml:
 *
 * [vars]
 * GITHUB_TOKEN = "ghp_xxxxxxxxxxxx"
 * OPENAI_API_KEY = "sk-xxxxxxxxxxxx"
 *
 * Or use wrangler secrets:
 * $ wrangler secret put GITHUB_TOKEN
 * $ wrangler secret put OPENAI_API_KEY
 */
