import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { logger } from '../observability/minimal-logger.js';
import { ErrorHelpers } from '../utils/errors.js';
import { expandEnvironmentVariables } from './env-expander.js';
import { type HatagoConfig, validateConfig } from './types.js';

// Configuration file path candidates
const CONFIG_FILENAMES = [
  'hatago.config.jsonc',
  'hatago.config.json',
  '.hatago/config.jsonc',
  '.hatago/config.json',
];

/**
 * Search for configuration file
 */
export async function findConfigFile(
  startDir?: string,
): Promise<string | undefined> {
  const searchDir = startDir || process.cwd() || '.';

  // Search from current directory
  for (const filename of CONFIG_FILENAMES) {
    const filepath = join(searchDir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }

  // Also search .hatago folder in home directory
  const homeConfigDir = join(homedir(), '.hatago');
  for (const filename of ['config.jsonc', 'config.json']) {
    const filepath = join(homeConfigDir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }

  return undefined;
}

/**
 * Load configuration file
 */
export async function loadConfigFile(
  filepath: string,
  options?: { quiet?: boolean },
): Promise<HatagoConfig> {
  try {
    if (!options?.quiet) {
      logger.info(`Loading config from: ${filepath}`);
    }

    // Read file
    const content = await readFile(filepath, 'utf-8');

    // Parse JSONC
    const parsed = parseJsonc(content);

    // Expand environment variables
    const expanded = expandEnvironmentVariables(parsed);

    // Convert mcpServers format (required)
    const { mergeConfigWithMcpServers } = await import('./mcp-converter.js');
    const merged = mergeConfigWithMcpServers(
      expanded as Partial<HatagoConfig> & { mcpServers?: any },
    );

    // Debug: Check if servers are present after merge
    if (!options?.quiet && merged.mcpServers) {
      logger.debug(
        `Original mcpServers: ${Object.keys(merged.mcpServers).length} entries`,
      );
    }

    // Validation - add servers field
    const config = validateConfig({
      ...merged,
      servers: merged.servers || [],
    } as HatagoConfig);

    if (!options?.quiet) {
      logger.info(`Config loaded successfully`);
    }
    return config;
  } catch (error) {
    if (!options?.quiet) {
      logger.error(`Failed to load config from ${filepath}:`, error);
    }
    throw error;
  }
}

/**
 * Create default configuration
 */
export function createDefaultConfig(): HatagoConfig {
  return validateConfig({
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
      global: 4,
    },
    security: {
      redactKeys: ['password', 'apiKey', 'token', 'secret'],
    },
    mcpServers: {},
  });
}

/**
 * Load configuration (from file or default)
 */
export async function loadConfig(
  configPath?: string,
  options?: { quiet?: boolean; profile?: string },
): Promise<HatagoConfig> {
  // If profile is specified
  if (options?.profile && options.profile !== 'default') {
    // Validate profile name (prevent path traversal attacks)
    const profileName = options.profile;
    if (!/^[a-zA-Z0-9_-]+$/.test(profileName)) {
      throw ErrorHelpers.invalidInput(
        'profile name',
        `${profileName} - Only alphanumeric characters, hyphens, and underscores are allowed`,
      );
    }

    const profilePath = join(
      process.cwd(),
      '.hatago',
      'profiles',
      `${profileName}.jsonc`,
    );

    // Ensure path is within expected directory
    const expectedDir = join(process.cwd(), '.hatago', 'profiles');
    if (!profilePath.startsWith(expectedDir)) {
      throw ErrorHelpers.invalidProfilePath(profilePath);
    }

    if (existsSync(profilePath)) {
      if (!options?.quiet) {
        logger.info(`Loading profile: ${profileName}`);
      }
      return await loadConfigFile(profilePath, options);
    }

    // Warn if profile file not found
    if (!options?.quiet) {
      logger.warn(
        `Profile '${options.profile}' not found at ${profilePath}, falling back to default config`,
      );
    }
  }

  // If explicit path is specified
  if (configPath) {
    const resolvedPath = resolve(configPath);
    if (!existsSync(resolvedPath)) {
      throw ErrorHelpers.configNotFound(resolvedPath);
    }
    return await loadConfigFile(resolvedPath, options);
  }

  // Search for configuration file
  const foundPath = await findConfigFile();
  if (foundPath) {
    return await loadConfigFile(foundPath, options);
  }

  // Use default configuration
  if (!options?.quiet) {
    logger.info('No config file found, using default configuration');
  }
  return createDefaultConfig();
}

/**
 * Generate sample configuration file
 */
export function generateSampleConfig(): string {
  return `{
  // JSON Schema for IDE support (auto-completion, validation, etc.)
  "$schema": "./schemas/config.schema.json",
  
  // Hatago MCP Hub Configuration File
  // This file configures how Hatago manages and proxies MCP servers
  
  // Configuration format version (currently 1)
  "version": 1,
  
  // Logging level for the application
  // Options: "error", "warn", "info", "debug", "trace"
  "logLevel": "info",
  
  // HTTP server configuration (optional)
  "http": {
    // Port number for the HTTP server
    // Default: 3000
    "port": 3000,
    
    // Host to bind the server to
    // Use "0.0.0.0" to listen on all interfaces
    "host": "localhost"
  },
  
  // ============================================
  // MCP Server Configuration
  // ============================================
  // You can use either Claude Code compatible format (mcpServers)
  // or Hatago's detailed format (servers), or both!
  
  // ---------------------------------------------
  // Option 1: Claude Code Compatible Format (Recommended)
  // ---------------------------------------------
  // This format is compatible with Claude Code's .mcp.json
  // You can copy your existing .mcp.json mcpServers section here
  "mcpServers": {
    // Local MCP server example
    "example-local": {
      "command": "node",
      "args": ["./examples/mcp-server.js"],
      "env": {
        "DEBUG": "true"
      },
      
      // Hatago-specific options (optional)
      "hatagoOptions": {
        "start": "lazy",  // "eager" to start immediately, "lazy" to start on first use
        "tools": {
          "exclude": ["dangerous_tool"]  // Exclude specific tools
        }
      }
    },
    
    // NPX-based MCP server example
    // Note: Some packages require "stdio" argument, others don't
    // See docs/npx-compatibility.json for package-specific requirements
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/tmp"],
      
      // hatagoOptions are optional - defaults will be used if not specified
      "hatagoOptions": {
        "start": "lazy",
        "tools": {
          "prefix": "fs"  // Add prefix to all tools from this server
        }
      }
    },
    
    // Remote MCP server example (Hatago extension)
    "remote-api": {
      // URL indicates this is a remote server
      "url": "https://mcp.example.com",
      
      "hatagoOptions": {
        "auth": {
          "type": "bearer",
          "token": "\${env:API_TOKEN}"  // Environment variable reference
        },
        "healthCheck": {
          "enabled": true,
          "intervalMs": 5000
        }
      }
    },
    
    // SSE (Server-Sent Events) server example
    "sse-server": {
      "type": "sse",  // Explicit transport type
      "url": "\${API_BASE_URL:-https://api.example.com}/mcp",  // With default value
      "headers": {
        "Authorization": "Bearer \${API_KEY}"  // Will be converted to auth config
      }
    },
    
    // HTTP server example  
    "http-server": {
      "type": "http",  // Standard HTTP transport
      "url": "\${SERVICE_URL:?Service URL is required}",  // Required env var
      "headers": {
        "Authorization": "Bearer \${SERVICE_TOKEN:-default-token}",
        "X-Custom-Header": "value"
      },
      "hatagoOptions": {
        "healthCheck": {
          "enabled": true,
          "method": "ping"
        }
      }
    }
  },
  
  */
  
  // ============================================
  // Advanced Hatago Configuration (Optional)
  // ============================================
  
  // Tool naming configuration
  // Controls how tool names from different servers are handled
  "toolNaming": {
    // Strategy for handling name conflicts between servers
    // "namespace": Prefix tool names with server ID (recommended)
    // "error": Fail when conflicts are detected
    "strategy": "namespace",
    
    // Separator character for namespaced tool names
    // Example: "server_toolname" when separator is "_"
    "separator": "_",
    
    // Format template for tool names
    // Available variables: {serverId}, {toolName}
    "format": "{serverId}_{toolName}",
    
    // Aliases for specific tools
    // Map long namespaced names to shorter aliases
    "aliases": {
      // "filesystem_read_file": "read",
      // "filesystem_write_file": "write"
    }
  },
  
  // Session management configuration
  "session": {
    // Session timeout in seconds
    // Sessions are cleaned up after this period of inactivity
    "ttlSeconds": 3600,
    
    // Whether to persist sessions across restarts
    "persist": false,
    
    // Storage backend for sessions
    // Options: "memory" (default), "redis" (future)
    "store": "memory"
  },
  
  // Timeout configuration (in milliseconds)
  "timeouts": {
    // Timeout for spawning new server processes
    "spawnMs": 8000,
    
    // Timeout for health check operations
    "healthcheckMs": 2000,
    
    // Timeout for individual tool calls
    "toolCallMs": 20000
  },
  
  // Concurrency limits
  "concurrency": {
    // Maximum concurrent operations across all servers
    "global": 4,

    // Concurrency for server initialization
    "serverInit": 4,

    // Concurrency for NPX package warmup
    "warmup": 4
  },
  
  // Security configuration
  "security": {
    // Keys to redact from logs and error messages
    // Add any sensitive field names here
    "redactKeys": ["password", "apiKey", "token", "secret"],
    
    // Allowed network destinations for remote servers
    // IMPORTANT: Use hostnames only, not full URLs!
    // Examples: ["api.github.com", "localhost", "192.168.1.100"]
    // Use ["*"] to allow all hosts (NOT recommended for production)
    // See docs/allownet-configuration.md for detailed configuration guide
    "allowNet": []
  }
}`;
}

/**
 * Generate JSON Schema for configuration
 */
export async function generateJsonSchema(): Promise<unknown> {
  // Import dynamically to avoid circular dependency
  try {
    // Try to import pre-generated schema first
    const { CONFIG_SCHEMA } = await import('../config/schema.js');
    return CONFIG_SCHEMA;
  } catch {
    // Fallback: generate schema on the fly
    // const { zodToJsonSchema } = await import('zod-to-json-schema');
    // const { HatagoConfigSchema } = await import('../config/types.js');

    // const jsonSchema = zodToJsonSchema(HatagoConfigSchema, {
    //   name: 'HatagoConfig',
    //   $refStrategy: 'none',
    //   errorMessages: true,
    //   markdownDescription: true,
    // });

    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'https://github.com/himorishige/hatago-hub/schemas/config.schema.json',
      title: 'Hatago MCP Hub Configuration',
      description:
        'Configuration schema for Hatago MCP Hub - A lightweight MCP server management tool',
      // ...jsonSchema,
    };
  }
}

/**
 * Expand environment variables
 */
export function expandEnvVars(value: string): string {
  return value.replace(/\${env:([^}]+)}/g, (_, envVar) => {
    return process.env[envVar] || '';
  });
}

/**
 * Merge configurations
 */
export function mergeConfig(
  base: HatagoConfig,
  override: Partial<HatagoConfig>,
): HatagoConfig {
  return validateConfig({
    ...base,
    ...override,
    http: {
      ...base.http,
      ...override.http,
    },
    toolNaming: {
      ...base.toolNaming,
      ...override.toolNaming,
    },
    session: {
      ...base.session,
      ...override.session,
    },
    timeouts: {
      ...base.timeouts,
      ...override.timeouts,
    },
    concurrency: {
      ...base.concurrency,
      ...override.concurrency,
    },
    security: {
      ...base.security,
      ...override.security,
    },
    servers: override.servers || base.servers,
  });
}
