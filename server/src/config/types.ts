import { z } from 'zod';

// ツール命名戦略
export const ToolNamingStrategySchema = z.enum(['namespace', 'alias', 'error']);
export type ToolNamingStrategy = z.infer<typeof ToolNamingStrategySchema>;

// ツール命名設定
export const ToolNamingConfigSchema = z.object({
  strategy: ToolNamingStrategySchema.default('namespace'),
  separator: z.string().default('_'), // Claude Code互換のためアンダースコア
  format: z.string().default('{serverId}_{toolName}'),
  aliases: z.record(z.string()).optional(), // ツール名のエイリアス定義
});
export type ToolNamingConfig = z.infer<typeof ToolNamingConfigSchema>;

// セッション設定
export const SessionConfigSchema = z.object({
  ttlSeconds: z.number().default(3600),
  persist: z.boolean().default(false),
  store: z.enum(['memory', 'file', 'redis']).default('memory'),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

// セッション共有設定
export const SessionSharingConfigSchema = z.object({
  enabled: z.boolean().default(false),
  maxClientsPerSession: z.number().default(5),
  conflictResolution: z
    .enum(['first-wins', 'last-wins', 'manual'])
    .default('first-wins'),
  syncIntervalMs: z.number().default(1000),
  tokenTtlSeconds: z.number().default(86400), // 24時間
});
export type SessionSharingConfig = z.infer<typeof SessionSharingConfigSchema>;

// HTTPサーバー設定
export const HttpConfigSchema = z.object({
  port: z.number().default(3000),
  host: z.string().default('localhost'),
});
export type HttpConfig = z.infer<typeof HttpConfigSchema>;

// タイムアウト設定
export const TimeoutsConfigSchema = z.object({
  spawnMs: z.number().default(8000),
  healthcheckMs: z.number().default(2000),
  toolCallMs: z.number().default(20000),
});
export type TimeoutsConfig = z.infer<typeof TimeoutsConfigSchema>;

// 並列実行設定
export const ConcurrencyConfigSchema = z.object({
  global: z.number().default(8),
  perServer: z.record(z.number()).optional(),
});
export type ConcurrencyConfig = z.infer<typeof ConcurrencyConfigSchema>;

// セキュリティ設定
export const SecurityConfigSchema = z.object({
  redactKeys: z
    .array(z.string())
    .default(['password', 'apiKey', 'token', 'secret']),
  allowNet: z.array(z.string()).optional(),
});
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;

// ポリシールール
export const PolicyRuleSchema = z.object({
  id: z.string(),
  name: z.string(),
  effect: z.enum(['allow', 'deny']),
  principal: z.string().optional(), // ユーザー/アプリ識別子
  tool: z.string(), // ツール名パターン（ワイルドカード対応）
  conditions: z.record(z.unknown()).optional(), // 追加条件
});
export type PolicyRule = z.infer<typeof PolicyRuleSchema>;

// ポリシー設定
export const PolicyConfigSchema = z.object({
  enabled: z.boolean().default(false),
  dryRun: z.boolean().default(true), // 最初はドライランから開始
  defaultEffect: z.enum(['allow', 'deny']).default('deny'), // デフォルト拒否
  rules: z.array(PolicyRuleSchema).default([]),
  auditLog: z.boolean().default(true),
});
export type PolicyConfig = z.infer<typeof PolicyConfigSchema>;

// Registry永続化設定
export const RegistryPersistConfigSchema = z.object({
  enabled: z.boolean().default(false),
  type: z.enum(['memory', 'file']).default('memory'),
  saveIntervalMs: z.number().default(5000), // 5秒ごとに保存
  retainDays: z.number().default(7), // 7日間保持
});
export type RegistryPersistConfig = z.infer<typeof RegistryPersistConfigSchema>;

// Registry設定
export const RegistryConfigSchema = z.object({
  persist: RegistryPersistConfigSchema.optional(),
  healthCheckIntervalMs: z.number().default(30000), // 30秒ごとにヘルスチェック
  maxRestarts: z.number().default(3),
  restartDelayMs: z.number().default(5000),
});
export type RegistryConfig = z.infer<typeof RegistryConfigSchema>;

// 世代管理設定
export const GenerationConfigSchema = z.object({
  autoReload: z.boolean().default(true),
  watchPaths: z.array(z.string()).default(['.hatago/config.jsonc']),
  gracePeriodMs: z.number().default(30000), // 30秒の猶予期間
  maxGenerations: z.number().default(3), // 保持する最大世代数
});
export type GenerationConfig = z.infer<typeof GenerationConfigSchema>;

// ロールオーバー設定
export const RolloverConfigSchema = z.object({
  enabled: z.boolean().default(false),
  healthCheckIntervalMs: z.number().default(5000),
  drainTimeoutMs: z.number().default(60000), // 60秒でドレイン
  errorRateThreshold: z.number().default(0.1), // 10%エラー率で自動ロールバック
  warmupTimeMs: z.number().default(10000), // 10秒のウォームアップ
});
export type RolloverConfig = z.infer<typeof RolloverConfigSchema>;

// レプリケーション設定
export const ReplicationConfigSchema = z.object({
  enabled: z.boolean().default(false),
  store: z.enum(['memory', 'file', 'redis']).default('memory'),
  syncIntervalMs: z.number().default(1000), // 1秒ごとに同期
  primaryNode: z.string().optional(),
  nodes: z.array(z.string()).default([]),
});
export type ReplicationConfig = z.infer<typeof ReplicationConfigSchema>;

// トランスポートタイプ
export const TransportTypeSchema = z.enum(['stdio', 'http', 'websocket']);
export type TransportType = z.infer<typeof TransportTypeSchema>;

// サーバータイプ
export const ServerTypeSchema = z.enum(['local', 'remote', 'npx']);
export type ServerType = z.infer<typeof ServerTypeSchema>;

// 起動モード
export const StartModeSchema = z.enum(['eager', 'lazy']);
export type StartMode = z.infer<typeof StartModeSchema>;

// ツールフィルター設定
export const ToolsConfigSchema = z.object({
  include: z.array(z.string()).default(['*']),
  exclude: z.array(z.string()).optional(),
  prefix: z.string().optional(), // サーバー固有のプレフィックス
  aliases: z.record(z.string()).optional(), // ツール単位のエイリアス
});
export type ToolsConfig = z.infer<typeof ToolsConfigSchema>;

// ベースサーバー設定
export const BaseServerConfigSchema = z.object({
  id: z.string(), // サーバーID（アンダースコア推奨）
  type: ServerTypeSchema,
  start: StartModeSchema.default('lazy'),
  tools: ToolsConfigSchema.optional(),
  env: z.record(z.string()).optional(),
});

// ローカルサーバー設定
export const LocalServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.literal('local'),
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  transport: z.literal('stdio').default('stdio'),
});
export type LocalServerConfig = z.infer<typeof LocalServerConfigSchema>;

// リモートサーバー設定
export const RemoteServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.literal('remote'),
  url: z.string(),
  transport: z
    .enum(['http', 'websocket', 'sse', 'streamable-http'])
    .default('http'),
  auth: z
    .object({
      type: z.enum(['bearer', 'basic']).optional(),
      token: z.string().optional(),
    })
    .optional(),
  healthCheck: z
    .object({
      enabled: z
        .boolean()
        .default(false)
        .describe('Enable health checks for this server'),
      mode: z
        .enum(['initialize-only', 'initialize+ping', 'full'])
        .default('initialize+ping')
        .describe(
          'Health check mode. initialize-only: only check connection, initialize+ping: check connection and ping, full: check all declared capabilities',
        ),
      intervalMs: z
        .number()
        .min(0)
        .default(0)
        .describe(
          'Health check interval in milliseconds. 0 = disabled. Recommended: 1000-2000ms for local, 5000-10000ms for remote',
        ),
      timeoutMs: z
        .number()
        .min(1000)
        .default(5000)
        .describe(
          'Health check timeout in milliseconds. Should be less than intervalMs. Can be overridden by HATAGO_HEALTH_TIMEOUT_MS env var',
        ),
      startupGraceMs: z
        .number()
        .min(0)
        .default(5000)
        .describe(
          'Grace period in milliseconds after startup before health checks begin',
        ),
      skipMethods: z
        .array(z.string())
        .optional()
        .describe(
          'Methods to skip during health checks (e.g., ["resources/list", "prompts/list"])',
        ),
      method: z
        .enum(['ping', 'tools/list'])
        .default('ping')
        .describe(
          'Method to use for health checks. "ping" is lighter, "tools/list" verifies tool availability',
        ),
    })
    .optional()
    .describe('Health check configuration for remote servers'),
  timeouts: z
    .object({
      timeout: z
        .number()
        .min(1000)
        .max(300000)
        .default(30000)
        .describe(
          'Initial timeout in milliseconds for tool calls (default: 30000)',
        ),
      maxTotalTimeout: z
        .number()
        .min(1000)
        .max(600000)
        .default(300000)
        .describe(
          'Maximum total timeout in milliseconds (default: 300000 = 5 minutes)',
        ),
      resetTimeoutOnProgress: z
        .boolean()
        .default(true)
        .describe(
          'Reset timeout when progress notifications are received (default: true)',
        ),
    })
    .optional()
    .describe('Timeout configuration for tool calls'),
  quirks: z
    .object({
      useDirectClient: z
        .boolean()
        .optional()
        .describe(
          'Use direct Client instead of facade (for servers that reject sessionId)',
        ),
      skipProtocolNegotiation: z
        .boolean()
        .optional()
        .describe('Skip protocol negotiation and use default version'),
      forceProtocolVersion: z
        .string()
        .optional()
        .describe(
          'Force a specific protocol version (e.g., "2025-03-26" for DeepWiki)',
        ),
      assumedCapabilities: z
        .object({
          tools: z.boolean().optional(),
          resources: z.boolean().optional(),
          prompts: z.boolean().optional(),
        })
        .optional()
        .describe(
          'Manually set capabilities when server does not provide them',
        ),
    })
    .optional()
    .describe('Server-specific workarounds and quirks'),
});
export type RemoteServerConfig = z.infer<typeof RemoteServerConfigSchema>;

// NPXサーバー設定
export const NpxServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.literal('npx'),
  package: z.string(),
  version: z.string().optional(),
  args: z.array(z.string()).optional(),
  transport: z.literal('stdio').default('stdio'),
  autoRestart: z.boolean().optional(),
  restartDelayMs: z.number().optional(),
  maxRestarts: z.number().optional(),
  timeout: z.number().optional(),
  shutdownTimeoutMs: z.number().optional(),
  initTimeoutMs: z.number().optional(), // MCP initialization timeout
  workDir: z.string().optional(), // Working directory
  cache: z
    .object({
      preferOffline: z.boolean().default(true), // Use cache when available
      checkIntervalMs: z.number().default(300000), // 5 minutes
      forceRefresh: z.boolean().default(false), // Force refresh cache on start
    })
    .optional(),
});
export type NpxServerConfig = z.infer<typeof NpxServerConfigSchema>;

// サーバー設定のユニオン型
export const ServerConfigSchema = z.discriminatedUnion('type', [
  LocalServerConfigSchema,
  RemoteServerConfigSchema,
  NpxServerConfigSchema,
]);
export type ServerConfig = z.infer<typeof ServerConfigSchema>;

// メイン設定
// Claude Code .mcp.json互換性のための型定義
// Hatago独自オプション
export const HatagoOptionsSchema = z.object({
  start: z.enum(['eager', 'lazy']).optional(),
  tools: ToolsConfigSchema.optional(),
  concurrency: z.number().optional(),
  timeout: z.number().optional(),
  auth: z
    .object({
      type: z.enum(['bearer', 'basic']).optional(),
      token: z.string().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
    })
    .optional(),
  healthCheck: z
    .object({
      enabled: z.boolean().default(false),
      intervalMs: z.number().optional(),
      timeoutMs: z.number().optional(),
      method: z.enum(['ping', 'tools/list']).optional(),
    })
    .optional(),
  autoRestart: z.boolean().optional(),
  maxRestarts: z.number().optional(),
  restartDelayMs: z.number().optional(),
  timeouts: z
    .object({
      timeout: z.number().min(1000).max(300000).optional(),
      maxTotalTimeout: z.number().min(1000).max(600000).optional(),
      resetTimeoutOnProgress: z.boolean().optional(),
    })
    .optional(),
});
export type HatagoOptions = z.infer<typeof HatagoOptionsSchema>;

// Claude Code互換のMCPサーバー設定
export const McpServerConfigSchema = z.object({
  // Claude Code標準プロパティ
  type: z.enum(['stdio', 'sse', 'http', 'remote']).optional(), // Transport types including remote
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(), // Working directory for local servers

  // SSE/HTTP/Remote用
  url: z.string().optional(),
  transport: z.enum(['http', 'sse', 'websocket', 'streamable-http']).optional(), // Transport protocol
  headers: z.record(z.string()).optional(), // Authentication headers for SSE/HTTP

  // Remote server auth
  auth: z
    .object({
      type: z.enum(['bearer', 'basic']),
      token: z.string(),
    })
    .optional(),

  // Remote server health check
  healthCheck: z
    .object({
      intervalMs: z.number().optional(),
      timeoutMs: z.number().optional(),
    })
    .optional(),

  // Hatago独自オプション
  hatagoOptions: HatagoOptionsSchema.optional(),
});
export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;

// mcpServers形式（Claude Code互換）
export const McpServersSchema = z.record(McpServerConfigSchema);
export type McpServers = z.infer<typeof McpServersSchema>;
export const HatagoConfigSchema = z.object({
  version: z.number().default(1),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  http: HttpConfigSchema.optional(),

  // Claude Code互換形式
  mcpServers: McpServersSchema.optional(),

  // 内部使用のみ（mcpServersから自動変換される）
  servers: z.array(ServerConfigSchema).optional(),
  toolNaming: ToolNamingConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  sessionSharing: SessionSharingConfigSchema.default({}),
  timeouts: TimeoutsConfigSchema.default({}),
  concurrency: ConcurrencyConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  policy: PolicyConfigSchema.default({}),
  registry: RegistryConfigSchema.default({}),
  generation: GenerationConfigSchema.default({}),
  rollover: RolloverConfigSchema.default({}),
  replication: ReplicationConfigSchema.default({}),

  npxCache: z
    .object({
      enabled: z.boolean().default(true),
      warmupOnStart: z.boolean().default(true),
      cacheCheckIntervalMs: z.number().default(300000), // 5 minutes
      verifyCacheIntegrity: z.boolean().default(false),
    })
    .optional(),
});
export type HatagoConfig = z.infer<typeof HatagoConfigSchema>;

// 設定ファイルのバリデーション
export function validateConfig(config: unknown): HatagoConfig {
  return HatagoConfigSchema.parse(config);
}

// 設定のデフォルト値を取得
export function getDefaultConfig(): HatagoConfig {
  return HatagoConfigSchema.parse({});
}
