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
  store: z.enum(['memory', 'file']).default('memory'),
});
export type SessionConfig = z.infer<typeof SessionConfigSchema>;

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

// トランスポートタイプ
export const TransportTypeSchema = z.enum([
  'stdio',
  'http',
  'sse',
  'websocket',
]);
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
  transport: z.enum(['http', 'sse', 'websocket']).default('http'),
  auth: z
    .object({
      type: z.enum(['bearer', 'basic']).optional(),
      token: z.string().optional(),
    })
    .optional(),
});
export type RemoteServerConfig = z.infer<typeof RemoteServerConfigSchema>;

// NPXサーバー設定
export const NpxServerConfigSchema = BaseServerConfigSchema.extend({
  type: z.literal('npx'),
  package: z.string(),
  version: z.string().optional(),
  args: z.array(z.string()).optional(),
  transport: z.literal('stdio').default('stdio'),
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
export const HatagoConfigSchema = z.object({
  version: z.number().default(1),
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  http: HttpConfigSchema.optional(),
  toolNaming: ToolNamingConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  timeouts: TimeoutsConfigSchema.default({}),
  concurrency: ConcurrencyConfigSchema.default({}),
  security: SecurityConfigSchema.default({}),
  servers: z.array(ServerConfigSchema).default([]),
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
