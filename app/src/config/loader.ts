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
  const sample = {
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
      aliases: {
        local_mcp_hello: 'hello',
        remote_api_search: 'search',
      },
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
      perServer: {
        local_mcp: 3,
      },
    },
    security: {
      redactKeys: ['password', 'apiKey', 'token', 'secret'],
      allowNet: ['https://api.example.com'],
    },
    servers: [
      {
        id: 'local_mcp',
        type: 'local',
        start: 'lazy',
        command: 'node',
        args: ['./examples/mcp-server.js'],
        transport: 'stdio',
        tools: {
          include: ['*'],
          exclude: ['dangerous_delete'],
          prefix: 'local',
        },
      },
      {
        id: 'remote_api',
        type: 'remote',
        start: 'eager',
        url: 'https://mcp.example.com',
        transport: 'http',
        auth: {
          type: 'bearer',
          // biome-ignore lint/suspicious/noTemplateCurlyInString: This is intentional - environment variable reference syntax
          token: '${env:HATAGO_API_TOKEN}',
        },
        tools: {
          include: ['*'],
          prefix: 'api',
        },
      },
      {
        id: 'npx_tool',
        type: 'npx',
        start: 'lazy',
        package: '@example/mcp-tool',
        version: '^1.0.0',
        transport: 'stdio',
        tools: {
          include: ['*'],
        },
      },
    ],
  };

  return JSON.stringify(sample, null, 2);
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
