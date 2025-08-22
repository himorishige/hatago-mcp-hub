/**
 * Serve command - Start the MCP Hub server
 */

import { serve } from '@hono/node-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Command } from 'commander';
import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { Logger } from 'pino';
import { loadConfig } from '../../config/loader.js';
import type { HatagoConfig } from '../../config/types.js';
import type { FileWatcher } from '../../core/file-watcher.js';
import { McpHub } from '../../core/mcp-hub.js';
import { StreamableHTTPTransport } from '../../hono-mcp/index.js';
import { ErrorHelpers } from '../../utils/errors.js';

export function createServeCommand(program: Command): void {
  program
    .command('serve')
    .description('Start the MCP Hub server')
    .option('-c, --config <path>', 'Path to config file')
    .option(
      '--profile <name>',
      'Profile to use (default: "default")',
      'default',
    )
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
        } = await import('../../utils/logger.js');

        // STDIOモードでは標準出力を使用しないため、console.logをstderrにリダイレクト
        // This must happen BEFORE any code that might use console.log
        if (options.mode === 'stdio') {
          const originalConsoleError = console.error;
          console.log = (...args: unknown[]) => {
            originalConsoleError('[STDIO-REDIRECT]', ...args);
          };
          console.warn = (...args: unknown[]) => {
            originalConsoleError('[STDIO-REDIRECT-WARN]', ...args);
          };
          // Keep console.error as is since it already goes to stderr

          // Set log level to silent in STDIO mode to prevent any log output
          options.quiet = true;
          options.logLevel = 'silent';
        }

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
          destination:
            options.mode === 'stdio' ? process.stderr : process.stdout,
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

        reqLogger.info({ mode: options.mode }, '🏨 Starting Hatago MCP Hub');

        // プロファイルに基づいて設定を読み込み
        const config = await loadConfig(options.config, {
          quiet: options.quiet,
          profile: options.profile,
        });

        // プロファイル設定を検証
        const { validateProfileConfig } = await import(
          '../../config/validator.js'
        );
        const validationResult = validateProfileConfig(config);

        if (!validationResult.valid) {
          validationResult.errors.forEach((error) => {
            reqLogger.error({ path: error.path }, error.message);
          });
          throw ErrorHelpers.invalidConfiguration();
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

        // Load CLI registry servers and merge with config
        const { CliRegistryStorage } = await import(
          '../../storage/cli-registry-storage.js'
        );
        const cliStorage = new CliRegistryStorage('.hatago/cli-registry.json');
        await cliStorage.initialize();
        const cliServers = await cliStorage.getServers();

        // Merge servers (config has priority)
        const configServerIds = new Set(config.servers.map((s) => s.id));
        for (const cliServer of cliServers) {
          if (!configServerIds.has(cliServer.id)) {
            config.servers.push(cliServer);
            reqLogger.info(`Added CLI server: ${cliServer.id}`);
          } else {
            reqLogger.warn(
              `CLI server '${cliServer.id}' skipped (name conflict with config)`,
            );
          }
        }

        // MCPハブを作成
        let hub = new McpHub({ config, logger: reqLogger });
        await withDuration(reqLogger, 'hub initialization', async () => {
          await hub.initialize();
        });

        // ホットリロード設定
        let fileWatcher: FileWatcher | null = null;
        if (config.generation?.autoReload) {
          const { FileWatcher } = await import('../../core/file-watcher.js');
          fileWatcher = new FileWatcher({
            watchPaths: config.generation.watchPaths || [
              '.hatago/config.jsonc',
            ],
            debounceMs: 2000,
          });

          fileWatcher.on('config:changed', async (event: { path: string }) => {
            reqLogger.info(
              { path: event.path },
              '🔄 Config changed, reloading...',
            );

            try {
              // 古いハブをシャットダウン
              await hub.shutdown();

              // 新しい設定を読み込み
              const newConfig = await loadConfig(
                options.config || '.hatago/config.jsonc',
                {
                  quiet: options.quiet,
                  profile: options.profile,
                },
              );

              // 新しいハブを作成
              hub = new McpHub({ config: newConfig, logger: reqLogger });
              await hub.initialize();

              reqLogger.info('✅ Hub reloaded successfully');
            } catch (error) {
              reqLogger.error({ error }, '❌ Failed to reload hub');
            }
          });

          await fileWatcher.start();
          reqLogger.info(
            { paths: fileWatcher.getWatchPaths() },
            '👁️ Watching config files for changes',
          );
        }

        // トランスポートモードに応じて起動
        if (options.mode === 'stdio') {
          // STDIOモード
          reqLogger.info(
            { profile: options.profile },
            `🏨 MCP Hub running in STDIO mode`,
          );

          process.stderr.write('[DEBUG] Creating StdioServerTransport...\n');
          const transport = new StdioServerTransport();
          process.stderr.write('[DEBUG] Transport created\n');

          // デバッグ: MCPサーバーのツール呼び出しをインターセプト
          const server = hub.getServer();
          const originalCallTool = server.callTool;
          if (originalCallTool) {
            server.callTool = async function (request: CallToolRequest) {
              console.error(
                `[DEBUG STDIO] Tool call request:`,
                JSON.stringify(request),
              );
              const result = await originalCallTool.call(this, request);
              console.error(
                `[DEBUG STDIO] Tool call response:`,
                JSON.stringify(result).substring(0, 200),
              );
              return result;
            };
          }

          // Connect the underlying SDK server instance to the transport
          process.stderr.write('[DEBUG] Connecting transport to server...\n');
          await hub.getServer().server.connect(transport);
          process.stderr.write('[DEBUG] Transport connected successfully\n');
        } else {
          // HTTPモード
          await startHttpServer(hub, config, reqLogger, options.port);
        }

        // シャットダウンハンドラ
        process.on('SIGINT', async () => {
          reqLogger.info('Received SIGINT, shutting down...');
          if (fileWatcher) {
            await fileWatcher.stop();
          }
          await hub.shutdown();
          process.exit(0);
        });

        process.on('SIGTERM', async () => {
          reqLogger.info('Received SIGTERM, shutting down...');
          if (fileWatcher) {
            await fileWatcher.stop();
          }
          await hub.shutdown();
          process.exit(0);
        });
      } catch (error) {
        const { logError, getGlobalLogger } = await import(
          '../../utils/logger.js'
        );
        const logger = getGlobalLogger();
        logError(logger, error, 'Failed to start server');
        process.exit(1);
      }
    });
}

async function startHttpServer(
  hub: McpHub,
  config: HatagoConfig,
  reqLogger: Logger,
  portOption?: string,
): Promise<void> {
  const app = new Hono();
  const port = portOption
    ? parseInt(portOption, 10)
    : config.http?.port || 3000;

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
  } = await import('../../utils/health.js');
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

  // MCPエンドポイント（セッション管理は中央のSessionManagerを使用）
  const sessionManager = hub.getSessionManager();

  // POSTエンドポイント（JSON-RPC）
  app.post('/mcp', async (c) => {
    // 各リクエストで新しいトランスポートを作成（ステートレス）
    const transport = new StreamableHTTPTransport({
      sessionIdGenerator: undefined, // ステートレスモード
      enableJsonResponse: true, // JSONレスポンスを有効化
    });

    try {
      // 一時的にサーバーに接続
      // Connect the underlying SDK server instance to the transport
      process.stderr.write('[DEBUG] Connecting transport to server...\n');
      await hub.getServer().server.connect(transport);
      process.stderr.write('[DEBUG] Transport connected successfully\n');

      const body = await c.req.json();

      // MCP仕様: サーバーからMcp-Session-Idが返されたら、以降のリクエストに必須
      // クライアントから送られてきたセッションIDをチェック
      const clientSessionId = c.req.header('mcp-session-id');

      // セッション検証
      let currentSession = null;
      if (clientSessionId) {
        // 既存セッションを取得（最終アクセス時刻も自動更新）
        currentSession = await sessionManager.getSession(clientSessionId);

        // セッションが見つからない場合はエラー
        if (!currentSession) {
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
      }

      const result = await transport.handleRequest(c, body);

      // handleRequestがundefinedを返す場合は、すでにレスポンスが送信されている
      if (!result) {
        // レスポンスはすでに送信済み
        return new Response(null, { status: 200 });
      }

      // MCP-Protocol-Versionヘッダーを追加
      const headers = new Headers(result.headers);
      headers.set('MCP-Protocol-Version', '2024-11-05');

      // レスポンスからMcp-Session-Idヘッダーをチェック
      if (result?.headers) {
        const serverSessionId = result.headers.get('mcp-session-id');
        if (serverSessionId && !currentSession) {
          // 新しいセッションを作成（中央のSessionManagerを使用）
          await sessionManager.createSession(serverSessionId);
          headers.set('Mcp-Session-Id', serverSessionId);
          reqLogger.info(`New session created: ${serverSessionId}`);
        } else if (serverSessionId && currentSession) {
          // 既存セッションを確認
          headers.set('Mcp-Session-Id', currentSession.id);
        }
      }

      // 新しいヘッダーでレスポンスを再構築
      return new Response(result.body, {
        status: result.status,
        statusText: result.statusText,
        headers,
      });
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
            code: -32603,
            message: 'Internal error',
            data: error instanceof Error ? error.message : String(error),
          },
          id: null,
        },
        500,
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

  // DELETEエンドポイント（セッション終了）
  app.delete('/mcp', async (c) => {
    // セッションIDがあれば検証
    const clientSessionId = c.req.header('mcp-session-id');

    if (clientSessionId) {
      // セッションを取得して削除（中央のSessionManagerを使用）
      const session = await sessionManager.getSession(clientSessionId);

      if (!session) {
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

      // セッションを削除
      await sessionManager.deleteSession(clientSessionId);
      reqLogger.info(`Session ${clientSessionId} terminated`);
    }

    // 200 OK with empty body
    return c.body(null, 200);
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
<title>🏨 Hatago MCP Hub</title>
<h1>🏨 Hatago MCP Hub v0.0.1</h1>
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
        `🏨 MCP Hub is running on http://localhost:${info.port}`,
      );
    },
  );
}
