#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { Command } from 'commander';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { generateSampleConfig, loadConfig } from '../config/loader.js';
import { McpHub } from '../core/mcp-hub.js';
import { StreamableHTTPTransport } from '../hono-mcp/index.js';
import { sanitizeLog } from '../utils/security.js';
import { createNpxCommands } from './commands/npx.js';
import { createRemoteCommands } from './commands/remote.js';

const program = new Command();

program
  .name('hatago')
  .description('Hatago MCP Hub - Unified MCP server management')
  .version('0.0.1');

/**
 * serveコマンド - MCPハブサーバーを起動
 */
program
  .command('serve')
  .description('Start the MCP Hub server')
  .option('-c, --config <path>', 'Path to config file')
  .option('--profile <name>', 'Profile to use (default: "default")', 'default')
  .option('-p, --port <port>', 'HTTP port', '3000')
  .option('-m, --mode <mode>', 'Transport mode: stdio | http', 'stdio')
  .option('--http', 'Use HTTP mode instead of STDIO')
  .option('-q, --quiet', 'Suppress non-essential output')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--log-level <level>', 'Log level: error, warn, info, debug, trace')
  .option('--log-format <format>', 'Log format: json | pretty')
  .action(async (options) => {
    try {
      // Loggerセットアップ
      const {
        createLogger,
        createRequestLogger,
        getLogLevel,
        setGlobalLogger,
        withDuration,
      } = await import('../utils/logger.js');

      const logLevel = getLogLevel({
        verbose: options.verbose,
        quiet: options.quiet,
        logLevel: options.logLevel,
      });

      const logger = createLogger({
        level: logLevel,
        format: options.logFormat,
        profile: options.profile,
        component: 'hatago-cli',
      });

      setGlobalLogger(logger);

      const reqLogger = createRequestLogger(logger, {
        cmd: 'serve',
        profile: options.profile,
      });

      // --httpオプションが指定されたらHTTPモードに
      if (options.http) {
        options.mode = 'http';
      }

      reqLogger.info({ mode: options.mode }, 'Starting Hatago MCP Hub');

      // プロファイルに基づいて設定を読み込み
      const config = await loadConfig(options.config, {
        quiet: options.quiet,
        profile: options.profile,
      });

      // プロファイル設定を検証
      const { validateProfileConfig } = await import('../config/validator.js');
      const validationResult = validateProfileConfig(config);

      if (!validationResult.valid) {
        validationResult.errors.forEach((error) => {
          reqLogger.error({ path: error.path }, error.message);
        });
        throw new Error('Invalid configuration');
      }

      if (validationResult.warnings.length > 0) {
        validationResult.warnings.forEach((warning) => {
          reqLogger.warn({ path: warning.path }, warning.message);
        });
      }

      // ポートを上書き
      if (options.port && config.http) {
        config.http.port = parseInt(options.port, 10);
      }

      // MCPハブを作成
      const hub = new McpHub({ config, logger: reqLogger });
      await withDuration(reqLogger, 'hub initialization', async () => {
        await hub.initialize();
      });

      // トランスポートモードに応じて起動
      if (options.mode === 'stdio') {
        // STDIOモード
        reqLogger.info(
          { profile: options.profile },
          `MCP Hub running in STDIO mode`,
        );
        const transport = new StdioServerTransport();
        await hub.getServer().connect(transport);
      } else {
        // HTTPモード
        const app = new Hono();
        const port = config.http?.port || 3000;

        // ヘルスチェックエンドポイント
        app.get('/health', (c) =>
          c.json({
            ok: true,
            name: 'hatago-hub',
            version: '0.0.1',
            timestamp: new Date().toISOString(),
          }),
        );

        // Readinessチェックエンドポイント
        const {
          HealthCheckManager,
          createConfigCheck,
          createWorkspaceCheck,
          createHatagoDirectoryCheck,
          createMCPServersCheck,
          createSystemResourcesCheck,
        } = await import('../utils/health.js');
        const healthManager = new HealthCheckManager(reqLogger);

        // ヘルスチェックを登録
        healthManager.register(createConfigCheck(() => !!config));
        healthManager.register(createWorkspaceCheck(config.workspace));
        healthManager.register(createHatagoDirectoryCheck());
        healthManager.register(
          createMCPServersCheck(() => {
            // MCPハブから接続情報を取得
            const connections = Array.from(hub.getConnections().entries());
            return connections.map(([id, conn]) => ({
              id,
              state: conn.connected ? 'running' : 'stopped',
              type: conn.type,
            }));
          }),
        );
        healthManager.register(createSystemResourcesCheck());

        app.get('/readyz', async (c) => {
          const status = await healthManager.runAll();
          const httpStatus = status.status === 'ready' ? 200 : 503;

          return c.json(status, httpStatus);
        });

        // MCPエンドポイント（ステートレスモード）
        // セッションIDキャッシュ（MCP準拠のため）
        let cachedSessionId: string | undefined;

        // POSTエンドポイント（JSON-RPC）
        app.post('/mcp', async (c) => {
          // 各リクエストで新しいトランスポートを作成（ステートレス）
          const transport = new StreamableHTTPTransport({
            sessionIdGenerator: undefined, // ステートレスモード（サーバーがセッションIDを返さない限り不要）
            enableJsonResponse: false,
          });

          try {
            // 一時的にサーバーに接続
            await hub.getServer().connect(transport);

            const body = await c.req.json();

            // MCP仕様: サーバーからMcp-Session-Idが返されたら、以降のリクエストに必須
            // クライアントから送られてきたセッションIDをチェック
            const clientSessionId = c.req.header('mcp-session-id');
            if (cachedSessionId && clientSessionId !== cachedSessionId) {
              // セッションIDが一致しない場合は404を返す（MCP仕様）
              return c.json(
                {
                  jsonrpc: '2.0',
                  error: {
                    code: -32001,
                    message: 'Session not found',
                  },
                  id: null,
                },
                404,
              );
            }

            const result = await transport.handleRequest(c, body);

            // レスポンスからMcp-Session-Idヘッダーをチェック
            if (result?.headers) {
              const serverSessionId = result.headers.get('mcp-session-id');
              if (serverSessionId) {
                cachedSessionId = serverSessionId;
              }
            }

            return result;
          } catch (error) {
            // エラーハンドリング
            reqLogger.error({ error }, 'MCP request error');

            // HTTPExceptionの場合はそのまま返す
            if (error instanceof HTTPException) {
              const response = error.getResponse();
              return response;
            }

            return c.json(
              {
                jsonrpc: '2.0',
                error: {
                  code: -32700,
                  message: 'Parse error',
                  data: error instanceof Error ? error.message : String(error),
                },
                id: null,
              },
              400,
            );
          } finally {
            // クリーンアップ
            try {
              await transport.close();
            } catch {
              // クローズエラーは無視
            }
          }
        });

        // GETエンドポイント（SSE - ステートレスモードでは非サポート）
        app.get('/mcp', async (c) => {
          // ステートレスモードではSSEをサポートしない
          return c.json(
            {
              jsonrpc: '2.0',
              error: {
                code: -32000,
                message: 'SSE not supported in stateless mode',
              },
              id: null,
            },
            405, // Method Not Allowed
          );
        });

        // ツール一覧エンドポイント
        app.get('/tools', (c) => {
          const tools = hub.getRegistry().getAllTools();
          return c.json({ tools });
        });

        // デバッグ情報エンドポイント
        app.get('/debug', (c) => {
          const debugInfo = hub.getRegistry().getDebugInfo();
          return c.json(debugInfo);
        });

        // ルートページ
        app.get('/', (c) =>
          c.html(`<!doctype html>
<meta charset="utf-8"/>
<title>Hatago MCP Hub</title>
<h1>Hatago MCP Hub v0.0.1</h1>
<p>MCP endpoint: <code>POST /mcp</code></p>
<p>Tools list: <code>GET /tools</code></p>
<p>Health check: <code>GET /health</code></p>
<p>Readiness check: <code>GET /readyz</code></p>
<p>Debug info: <code>GET /debug</code></p>
<p>Powered by Hono + MCP SDK</p>`),
        );

        // サーバーを起動
        serve(
          {
            fetch: app.fetch,
            port,
          },
          (info) => {
            reqLogger.info(
              { port: info.port, url: `http://localhost:${info.port}` },
              `MCP Hub is running on http://localhost:${info.port}`,
            );
          },
        );
      }

      // シャットダウンハンドラ
      process.on('SIGINT', async () => {
        reqLogger.info('Received SIGINT, shutting down...');
        await hub.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        reqLogger.info('Received SIGTERM, shutting down...');
        await hub.shutdown();
        process.exit(0);
      });
    } catch (error) {
      const { logError, getGlobalLogger } = await import('../utils/logger.js');
      const logger = getGlobalLogger();
      logError(logger, error, 'Failed to start server');
      process.exit(1);
    }
  });

/**
 * initコマンド - 設定ファイルを初期化
 */
program
  .command('init')
  .description('Initialize configuration file')
  .option('-o, --output <path>', 'Output path', '.hatago/config.jsonc')
  .action(async (options) => {
    try {
      const { createLogger } = await import('../utils/logger.js');
      const logger = createLogger({ component: 'hatago-cli-init' });

      logger.info({ path: options.output }, 'Creating config file');

      // サンプル設定を生成
      const sample = generateSampleConfig();

      // ファイルに書き込み
      await writeFile(options.output, sample, 'utf-8');

      logger.info('Config file created successfully');
      logger.info('Edit the file and then run: hatago serve');
    } catch (error) {
      const { logError, createLogger } = await import('../utils/logger.js');
      const logger = createLogger({ component: 'hatago-cli-init' });
      const _safeError = await sanitizeLog(String(error));
      logError(logger, error, 'Failed to create config file');
      process.exit(1);
    }
  });

/**
 * listコマンド - ツール一覧を表示
 */
program
  .command('list')
  .alias('ls')
  .description('List available tools')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      // Logger作成
      const { createLogger, getLogLevel } = await import('../utils/logger.js');

      const logger = createLogger({
        level: getLogLevel({ quiet: false }),
        component: 'hatago-cli-list',
      });

      // 設定を読み込み
      const config = await loadConfig(options.config);

      // MCPハブを作成
      const hub = new McpHub({ config, logger });
      await hub.initialize();

      // ツール一覧を取得
      const _tools = hub.getRegistry().getAllTools();
      const debugInfo = hub.getRegistry().getDebugInfo();

      // 構造化ログとして出力
      logger.info(
        {
          totalServers: debugInfo.totalServers,
          totalTools: debugInfo.totalTools,
          namingStrategy: debugInfo.namingStrategy,
        },
        'MCP Hub Status',
      );

      if (debugInfo.collisions.length > 0) {
        logger.warn(
          { collisions: debugInfo.collisions },
          'Tool name collisions detected',
        );
      }

      logger.info({ tools: debugInfo.tools }, 'Available tools');

      // クリーンアップ
      await hub.shutdown();
    } catch (error) {
      const { logError, createLogger } = await import('../utils/logger.js');
      const logger = createLogger({ component: 'hatago-cli-list' });
      logError(logger, error, 'Failed to list tools');
      process.exit(1);
    }
  });

/**
 * reloadコマンド - 設定を再読み込み
 */
program
  .command('reload')
  .description('Reload configuration')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      console.log('Reloading configuration...');

      // FileWatcherを使って設定を再読み込み
      const { FileWatcher } = await import('../core/file-watcher.js');
      const watcher = new FileWatcher({
        watchPaths: [options.config || '.hatago/config.jsonc'],
      });

      const newConfig = await watcher.reload();
      console.log('Configuration reloaded successfully');
      console.log('New config:', JSON.stringify(newConfig, null, 2));

      await watcher.stop();
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.error('Failed to reload configuration:', safeError);
      process.exit(1);
    }
  });

/**
 * statusコマンド - 世代とセッション状況を表示
 */
program
  .command('status')
  .description('Show generation and session status')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);

      // ConfigManagerを作成
      const { ConfigManager } = await import('../core/config-manager.js');
      const configManager = new ConfigManager({
        maxGenerations: config.generation?.maxGenerations,
        gracePeriodMs: config.generation?.gracePeriodMs,
      });

      // 現在の設定を読み込み
      await configManager.loadNewConfig(config);

      // ステータスを表示
      const status = configManager.getGenerationStatus();
      console.log('\n=== Generation Status ===');
      for (const gen of status) {
        const current = gen.isCurrent ? ' [CURRENT]' : '';
        console.log(`Generation ${gen.id}${current}`);
        console.log(`  Created: ${gen.createdAt.toISOString()}`);
        console.log(`  State: ${gen.state}`);
        console.log(`  References: ${gen.referenceCount}`);
      }

      await configManager.shutdown();
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.error('Failed to get status:', safeError);
      process.exit(1);
    }
  });

/**
 * policyコマンド - ポリシー管理
 */
program
  .command('policy')
  .description('Manage access policies')
  .option('-c, --config <path>', 'Path to config file')
  .option('--dry-run', 'Run in dry-run mode')
  .option('--stats', 'Show policy statistics')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);

      // PolicyGateとAuditLoggerを作成
      const { PolicyGate, AuditLogger } = await import(
        '../core/policy-gate.js'
      );
      const auditLogger = new AuditLogger({ outputToConsole: true });
      const policyGate = new PolicyGate(config.policy || {}, { auditLogger });

      if (options.stats) {
        // 統計情報を表示
        const stats = policyGate.getStats();
        console.log('\n=== Policy Statistics ===');
        console.log(`Enabled: ${stats.enabled}`);
        console.log(`Dry Run: ${stats.dryRun}`);
        console.log(`Rule Count: ${stats.ruleCount}`);
        console.log(`Default Effect: ${stats.defaultEffect}`);

        const auditStats = auditLogger.getStats();
        console.log('\n=== Audit Statistics ===');
        console.log(`Total Entries: ${auditStats.totalEntries}`);
        console.log(`Allow Count: ${auditStats.allowCount}`);
        console.log(`Deny Count: ${auditStats.denyCount}`);
        console.log(`Dry Run Count: ${auditStats.dryRunCount}`);
      } else if (options.dryRun) {
        // ドライランモードを有効化
        const updatedConfig = {
          ...config.policy,
          dryRun: true,
        };
        policyGate.updateConfig(updatedConfig);
        console.log('Policy dry-run mode enabled');
      } else {
        // 現在のポリシー設定を表示
        const policyConfig = policyGate.getConfig();
        console.log('\n=== Policy Configuration ===');
        console.log(JSON.stringify(policyConfig, null, 2));
      }
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.error('Failed to manage policy:', safeError);
      process.exit(1);
    }
  });

/**
 * sessionコマンド - セッション管理
 */
program
  .command('session')
  .description('Manage sessions')
  .option('-c, --config <path>', 'Path to config file')
  .option('--list', 'List active sessions')
  .option('--share <id>', 'Generate share token for session')
  .option('--join <token>', 'Join a shared session')
  .option('--clients <id>', 'Show connected clients for session')
  .option('--history <id>', 'Show session history')
  .action(async (options) => {
    try {
      const config = await loadConfig(options.config);

      // SharedSessionManagerを作成
      const { SharedSessionManager } = await import(
        '../core/shared-session-manager.js'
      );
      const sessionManager = new SharedSessionManager(
        config.sessionSharing || {},
      );

      if (options.list) {
        // アクティブセッション一覧
        const sessions = await sessionManager.getActiveSessions();
        console.log('\n=== Active Sessions ===');
        for (const { session, clients } of sessions) {
          const shared = clients.length > 1 ? ' [SHARED]' : '';
          console.log(`Session ${session.id}${shared}`);
          console.log(`  Created: ${session.createdAt.toISOString()}`);
          console.log(`  Clients: ${clients.length}`);
          console.log(`  History: ${session.history.length} entries`);
          if (session.sharedToken) {
            console.log(`  Token: ${session.sharedToken}`);
          }
        }

        // 統計情報
        const stats = sessionManager.getStats();
        console.log('\n=== Statistics ===');
        console.log(`Total Sessions: ${stats.totalSessions}`);
        console.log(`Total Clients: ${stats.totalClients}`);
        console.log(`Shared Sessions: ${stats.sharedSessions}`);
        console.log(
          `Avg Clients/Session: ${stats.averageClientsPerSession.toFixed(2)}`,
        );
      } else if (options.share) {
        // セッション共有トークンを生成
        const { getRuntime } = await import('../runtime/types.js');
        const runtime = await getRuntime();
        const clientId = await runtime.idGenerator.generate(); // 仮のクライアントID
        await sessionManager.createSession(clientId);
        const token = await sessionManager.generateShareToken(
          options.share,
          clientId,
        );
        console.log(`\nShare token generated for session ${options.share}:`);
        console.log(`Token: ${token}`);
        console.log(
          `Expires: ${new Date(
            Date.now() +
              (config.sessionSharing?.tokenTtlSeconds || 86400) * 1000,
          ).toISOString()}`,
        );
        console.log('\nTo join this session, run:');
        console.log(`  hatago session --join ${token}`);
      } else if (options.join) {
        // 共有セッションに参加
        const { getRuntime } = await import('../runtime/types.js');
        const runtime = await getRuntime();
        const clientId = await runtime.idGenerator.generate();
        const session = await sessionManager.joinSessionByToken(
          options.join,
          clientId,
          { source: 'cli' },
        );
        console.log(`\nJoined session ${session.id}`);
        console.log(`Your client ID: ${clientId}`);
        console.log(`Connected clients: ${session.clients.size}`);
      } else if (options.clients) {
        // セッションのクライアント一覧
        const clients = sessionManager.getSessionClients(options.clients);
        console.log(`\n=== Clients for session ${options.clients} ===`);
        for (const client of clients) {
          console.log(`Client ${client.id}`);
          console.log(`  Connected: ${client.connectedAt.toISOString()}`);
          console.log(
            `  Last Activity: ${client.lastActivityAt.toISOString()}`,
          );
          if (client.metadata) {
            console.log(`  Metadata: ${JSON.stringify(client.metadata)}`);
          }
        }
      } else if (options.history) {
        // セッション履歴
        const history = await sessionManager.getSessionHistory(
          options.history,
          50,
        );
        console.log(`\n=== History for session ${options.history} ===`);
        for (const entry of history) {
          console.log(`[${entry.timestamp.toISOString()}] ${entry.tool}`);
          console.log(`  Client: ${entry.clientId}`);
          if (entry.error) {
            console.log(`  Error: ${entry.error}`);
          }
        }
      } else {
        // デフォルト: セッション統計を表示
        const stats = sessionManager.getStats();
        console.log('\n=== Session Statistics ===');
        console.log(`Total Sessions: ${stats.totalSessions}`);
        console.log(`Total Clients: ${stats.totalClients}`);
        console.log(`Shared Sessions: ${stats.sharedSessions}`);
        console.log(
          `Avg Clients/Session: ${stats.averageClientsPerSession.toFixed(2)}`,
        );
      }

      await sessionManager.shutdown();
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.error('Failed to manage sessions:', safeError);
      process.exit(1);
    }
  });

/**
 * drainコマンド - 特定世代の手動ドレイン
 */
program
  .command('drain <generation>')
  .description('Manually drain a specific generation')
  .option('-c, --config <path>', 'Path to config file')
  .action(async (generation, options) => {
    try {
      console.log(`Draining generation ${generation}...`);

      const config = await loadConfig(options.config);

      // RolloverManagerを作成
      const { ConfigManager } = await import('../core/config-manager.js');
      const { RolloverManager } = await import('../core/rollover-manager.js');

      const configManager = new ConfigManager();
      await configManager.loadNewConfig(config);

      const rolloverManager = new RolloverManager(configManager, {
        healthCheckIntervalMs: config.rollover?.healthCheckIntervalMs,
        drainTimeoutMs: config.rollover?.drainTimeoutMs,
        errorRateThreshold: config.rollover?.errorRateThreshold,
        warmupTimeMs: config.rollover?.warmupTimeMs,
      });

      // ドレイン処理を実行（実際の実装では該当世代のワーカーを探してドレイン）
      console.log(`Generation ${generation} drain initiated`);

      await rolloverManager.shutdown();
      await configManager.shutdown();
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.error('Failed to drain generation:', safeError);
      process.exit(1);
    }
  });

/**
 * callコマンド - ツールを実行
 */
program
  .command('call <tool>')
  .description('Call a tool')
  .option('-c, --config <path>', 'Path to config file')
  .option('-i, --input <json>', 'Input JSON')
  .option('-f, --file <path>', 'Input from file')
  .action(async (tool, options) => {
    try {
      // 設定を読み込み
      const config = await loadConfig(options.config);

      // MCPハブを作成
      const hub = new McpHub({ config });
      await hub.initialize();

      // 入力を取得
      let input = {};
      if (options.input) {
        input = JSON.parse(options.input);
      } else if (options.file) {
        const content = await readFile(options.file, 'utf-8');
        input = JSON.parse(content);
      }

      // ツールを実行
      console.log(`Calling tool: ${tool}`);
      const result = await hub.callTool({
        name: tool,
        arguments: input,
      });

      // 結果を表示
      console.log('\n=== Result ===');
      console.log(JSON.stringify(result, null, 2));

      // クリーンアップ
      await hub.shutdown();
    } catch (error) {
      const safeError = await sanitizeLog(String(error));
      console.error('Failed to call tool:', safeError);
      process.exit(1);
    }
  });

/**
 * npxコマンド - NPX MCPサーバー管理
 */
program.addCommand(createNpxCommands());

/**
 * remoteコマンド - リモート MCPサーバー管理
 */
program.addCommand(createRemoteCommands());

// コマンドを実行
program.parse(process.argv);
