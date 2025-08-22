/**
 * Claude Code .mcp.json形式からHatago内部形式への変換
 */

import { ErrorHelpers } from '../utils/errors.js';
import type {
  HatagoConfig,
  HatagoOptions,
  LocalServerConfig,
  McpServerConfig,
  McpServers,
  NpxServerConfig,
  RemoteServerConfig,
  ServerConfig,
} from './types.js';

/**
 * サーバータイプを推論
 */
function inferServerType(config: McpServerConfig): 'local' | 'remote' | 'npx' {
  // typeフィールドが明示的に指定されている場合
  if (config.type === 'sse' || config.type === 'http') {
    return 'remote';
  }

  // URLがある場合はremote
  if (config.url) {
    return 'remote';
  }

  // commandがnpxの場合
  if (config.command === 'npx') {
    return 'npx';
  }

  // それ以外はlocal（stdioまたは未指定）
  return 'local';
}

/**
 * npxコマンドからパッケージ情報を抽出
 */
function extractNpxPackageInfo(args: string[] = []): {
  package: string;
  args: string[];
} {
  if (args.length === 0) {
    throw ErrorHelpers.invalidInput(
      'npx command',
      'Requires at least one argument (package name)',
    );
  }

  // 最初の引数がパッケージ名
  const [packageName, ...restArgs] = args;

  return {
    package: packageName,
    args: restArgs,
  };
}

/**
 * Hatago optionsをサーバー設定に適用
 */
function applyHatagoOptions<T extends ServerConfig>(
  base: T,
  options?: HatagoOptions,
): T {
  if (!options) {
    return base;
  }

  const result = { ...base };

  // 共通オプション
  if (options.start !== undefined) {
    result.start = options.start;
  }

  if (options.tools !== undefined) {
    result.tools = options.tools;
  }

  // NPX特有のオプション
  if (result.type === 'npx') {
    const npxConfig = result as NpxServerConfig;
    if (options.autoRestart !== undefined) {
      npxConfig.autoRestart = options.autoRestart;
    }
    if (options.maxRestarts !== undefined) {
      npxConfig.maxRestarts = options.maxRestarts;
    }
    if (options.restartDelayMs !== undefined) {
      npxConfig.restartDelayMs = options.restartDelayMs;
    }
    if (options.timeout !== undefined) {
      npxConfig.timeout = options.timeout;
    }
  }

  // Remote特有のオプション
  if (result.type === 'remote') {
    const remoteConfig = result as RemoteServerConfig;
    if (options.auth !== undefined) {
      remoteConfig.auth = options.auth;
    }
    if (options.healthCheck !== undefined) {
      remoteConfig.healthCheck = options.healthCheck;
    }
  }

  return result;
}

/**
 * 単一のMCPサーバー設定を内部形式に変換
 */
export function convertMcpServerToInternal(
  id: string,
  config: McpServerConfig,
): ServerConfig {
  const type = inferServerType(config);

  let baseConfig: ServerConfig;

  switch (type) {
    case 'npx': {
      const { package: packageName, args } = extractNpxPackageInfo(config.args);
      baseConfig = {
        id,
        type: 'npx',
        package: packageName,
        args,
        transport: 'stdio',
        start: 'lazy',
        env: config.env,
      } as NpxServerConfig;
      break;
    }

    case 'remote': {
      if (!config.url) {
        throw ErrorHelpers.invalidInput(
          'Remote server',
          `${id} requires a URL`,
        );
      }

      // headersからauth情報を抽出
      let auth: RemoteServerConfig['auth'];
      if (config.headers?.Authorization) {
        const authHeader = config.headers.Authorization;
        if (authHeader.startsWith('Bearer ')) {
          auth = {
            type: 'bearer',
            token: authHeader.substring(7),
          };
        } else if (authHeader.startsWith('Basic ')) {
          // Basic認証の場合はbase64デコードが必要だが、
          // 今回はtokenとして保持
          auth = {
            type: 'basic',
            token: authHeader.substring(6),
          };
        }
      }

      baseConfig = {
        id,
        type: 'remote',
        url: config.url,
        transport: config.type === 'sse' ? 'http' : 'http', // SSEもHTTPトランスポートを使用
        start: 'lazy',
        env: config.env,
        ...(auth && { auth }),
      } as RemoteServerConfig;
      break;
    }
    default: {
      if (!config.command) {
        throw ErrorHelpers.invalidInput(
          'Local server',
          `${id} requires a command`,
        );
      }
      baseConfig = {
        id,
        type: 'local',
        command: config.command,
        args: config.args || [],
        transport: 'stdio',
        start: 'lazy',
        env: config.env,
      } as LocalServerConfig;
      break;
    }
  }

  // Hatago optionsを適用
  return applyHatagoOptions(baseConfig, config.hatagoOptions);
}

/**
 * mcpServers形式全体を内部形式に変換
 */
export function convertMcpServersToInternal(
  mcpServers: McpServers,
): ServerConfig[] {
  const servers: ServerConfig[] = [];

  for (const [id, config] of Object.entries(mcpServers)) {
    try {
      servers.push(convertMcpServerToInternal(id, config));
    } catch (error) {
      throw ErrorHelpers.operationFailed(
        `Convert mcpServer '${id}'`,
        error instanceof Error ? error.message : String(error),
      );
    }
  }

  return servers;
}

/**
 * 設定にmcpServersが含まれる場合、内部形式に変換してマージ
 */
export function mergeConfigWithMcpServers(
  config: Partial<HatagoConfig> & { mcpServers?: McpServers },
): Partial<HatagoConfig> {
  if (!config.mcpServers) {
    return config;
  }

  const convertedServers = convertMcpServersToInternal(config.mcpServers);

  // 既存のserversとマージ（mcpServersから変換したものを先に配置）
  const existingServers = config.servers || [];
  const mergedServers = [...convertedServers, ...existingServers];

  // 重複IDをチェック
  const seenIds = new Set<string>();
  for (const server of mergedServers) {
    if (seenIds.has(server.id)) {
      throw ErrorHelpers.duplicateServerId(server.id);
    }
    seenIds.add(server.id);
  }

  return {
    ...config,
    servers: mergedServers,
  };
}
