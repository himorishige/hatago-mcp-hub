import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { expandEnvironmentVariables } from './env-expander.js';
import { type HatagoConfig, validateConfig } from './types.js';

// 設定ファイルのパス候補
const CONFIG_FILENAMES = [
  'hatago.config.jsonc',
  'hatago.config.json',
  '.hatago/config.jsonc',
  '.hatago/config.json',
];

/**
 * 設定ファイルを検索
 */
export async function findConfigFile(
  startDir?: string,
): Promise<string | undefined> {
  const searchDir = startDir || process.cwd();

  // カレントディレクトリから検索
  for (const filename of CONFIG_FILENAMES) {
    const filepath = join(searchDir, filename);
    if (existsSync(filepath)) {
      return filepath;
    }
  }

  // ホームディレクトリの.hatagoフォルダも検索
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
 * 設定ファイルを読み込み
 */
export async function loadConfigFile(
  filepath: string,
  options?: { quiet?: boolean },
): Promise<HatagoConfig> {
  try {
    if (!options?.quiet) {
      console.log(`Loading config from: ${filepath}`);
    }

    // ファイルを読み込み
    const content = await readFile(filepath, 'utf-8');

    // JSONCをパース
    const parsed = parseJsonc(content);

    // 環境変数を展開
    const expanded = expandEnvironmentVariables(parsed);

    // バリデーション
    const config = validateConfig(expanded);

    if (!options?.quiet) {
      console.log(`Config loaded successfully`);
    }
    return config;
  } catch (error) {
    if (!options?.quiet) {
      console.error(`Failed to load config from ${filepath}:`, error);
    }
    throw error;
  }
}

/**
 * デフォルト設定を作成
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
      global: 8,
    },
    security: {
      redactKeys: ['password', 'apiKey', 'token', 'secret'],
    },
    servers: [],
  });
}

/**
 * 設定を読み込み（ファイルまたはデフォルト）
 */
export async function loadConfig(
  configPath?: string,
  options?: { quiet?: boolean; profile?: string },
): Promise<HatagoConfig> {
  // プロファイルが指定されている場合
  if (options?.profile && options.profile !== 'default') {
    // プロファイル名の検証（パストラバーサル攻撃を防ぐ）
    const profileName = options.profile;
    if (!/^[a-zA-Z0-9_-]+$/.test(profileName)) {
      throw new Error(
        `Invalid profile name: ${profileName}. Only alphanumeric characters, hyphens, and underscores are allowed.`,
      );
    }

    const profilePath = join(
      process.cwd(),
      '.hatago',
      'profiles',
      `${profileName}.jsonc`,
    );

    // パスが期待されるディレクトリ内にあることを確認
    const expectedDir = join(process.cwd(), '.hatago', 'profiles');
    if (!profilePath.startsWith(expectedDir)) {
      throw new Error(`Invalid profile path: ${profilePath}`);
    }

    if (existsSync(profilePath)) {
      if (!options?.quiet) {
        console.log(`Loading profile: ${profileName}`);
      }
      return await loadConfigFile(profilePath, options);
    }

    // プロファイルファイルが見つからない場合は警告
    if (!options?.quiet) {
      console.warn(
        `Profile '${options.profile}' not found at ${profilePath}, falling back to default config`,
      );
    }
  }

  // 明示的なパスが指定されている場合
  if (configPath) {
    const resolvedPath = resolve(configPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }
    return await loadConfigFile(resolvedPath, options);
  }

  // 設定ファイルを検索
  const foundPath = await findConfigFile();
  if (foundPath) {
    return await loadConfigFile(foundPath, options);
  }

  // デフォルト設定を使用
  if (!options?.quiet) {
    console.log('No config file found, using default configuration');
  }
  return createDefaultConfig();
}

/**
 * サンプル設定ファイルを生成
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
  
  // HTTP server configuration
  "http": {
    // Port number for the HTTP server
    // Default: 3000
    "port": 3000,
    
    // Host to bind the server to
    // Use "0.0.0.0" to listen on all interfaces
    "host": "localhost"
  },
  
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
      "local_mcp_hello": "hello",
      "remote_api_search": "search"
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
    "global": 8,
    
    // Per-server concurrency limits
    // Overrides global limit for specific servers
    "perServer": {
      "local_mcp": 3
    }
  },
  
  // Security configuration
  "security": {
    // Keys to redact from logs and error messages
    // Add any sensitive field names here
    "redactKeys": ["password", "apiKey", "token", "secret"],
    
    // Allowed network destinations for remote servers
    // Use ["*"] to allow all (not recommended for production)
    "allowNet": ["https://api.example.com"]
  },
  
  // MCP server configurations
  // Each server can be local, remote, or npx-based
  "servers": [
    {
      // Unique identifier for this server
      "id": "local_mcp",
      
      // Server type: "local", "remote", or "npx"
      "type": "local",
      
      // When to start the server
      // "eager": Start immediately on hub startup
      // "lazy": Start when first tool is called
      "start": "lazy",
      
      // Command to execute (for local servers)
      "command": "node",
      
      // Command arguments
      "args": ["./examples/mcp-server.js"],
      
      // Transport protocol: "stdio" or "http"
      "transport": "stdio",
      
      // Tool filtering configuration
      "tools": {
        // Tools to include (["*"] for all)
        "include": ["*"],
        
        // Tools to exclude (takes precedence over include)
        "exclude": ["dangerous_delete"],
        
        // Optional prefix for all tools from this server
        "prefix": "local"
      }
    },
    {
      // Remote MCP server example
      "id": "remote_api",
      "type": "remote",
      "start": "eager",
      
      // URL of the remote MCP server
      "url": "https://mcp.example.com",
      
      // Transport must be "http" for remote servers
      "transport": "http",
      
      // Authentication configuration
      "auth": {
        // Auth type: "bearer", "basic", or "apikey"
        "type": "bearer",
        
        // Token can reference environment variables
        // Format: \${env:VARIABLE_NAME}
        "token": "\${env:HATAGO_API_TOKEN}"
      },
      
      "tools": {
        "include": ["*"],
        "prefix": "api"
      }
    },
    {
      // NPX-based MCP server example
      "id": "npx_tool",
      "type": "npx",
      "start": "lazy",
      
      // NPM package name
      "package": "@example/mcp-tool",
      
      // Package version (optional)
      "version": "^1.0.0",
      
      "transport": "stdio",
      
      "tools": {
        "include": ["*"]
      }
    }
  ]
}`;
}

/**
 * Generate JSON Schema for configuration
 */
export function generateJsonSchema(): unknown {
  // Import dynamically to avoid circular dependency
  try {
    // Try to import pre-generated schema first
    const { CONFIG_SCHEMA } = require('../config/schema.js');
    return CONFIG_SCHEMA;
  } catch {
    // Fallback: generate schema on the fly
    const { zodToJsonSchema } = require('zod-to-json-schema');
    const { HatagoConfigSchema } = require('../config/types.js');

    const jsonSchema = zodToJsonSchema(HatagoConfigSchema, {
      name: 'HatagoConfig',
      $refStrategy: 'none',
      errorMessages: true,
      markdownDescription: true,
    });

    return {
      $schema: 'http://json-schema.org/draft-07/schema#',
      $id: 'https://github.com/himorishige/hatago-hub/schemas/config.schema.json',
      title: 'Hatago MCP Hub Configuration',
      description:
        'Configuration schema for Hatago MCP Hub - A lightweight MCP server management tool',
      ...jsonSchema,
    };
  }
}

/**
 * 環境変数を展開
 */
export function expandEnvVars(value: string): string {
  return value.replace(/\${env:([^}]+)}/g, (_, envVar) => {
    return process.env[envVar] || '';
  });
}

/**
 * 設定のマージ
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
