#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Command } from 'commander';
import { Hono } from 'hono';
import { generateSampleConfig, loadConfig } from '../config/loader.js';
import { McpHub } from '../core/mcp-hub.js';
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
  .option('-p, --port <port>', 'HTTP port', '3000')
  .option('-m, --mode <mode>', 'Transport mode: http | stdio', 'http')
  .action(async (options) => {
    try {
      console.log('Starting Hatago MCP Hub...');

      // 設定を読み込み
      const config = await loadConfig(options.config);

      // ポートを上書き
      if (options.port && config.http) {
        config.http.port = parseInt(options.port, 10);
      }

      // MCPハブを作成
      const hub = new McpHub({ config });
      await hub.initialize();

      // トランスポートモードに応じて起動
      if (options.mode === 'stdio') {
        // STDIOモード
        console.log('Starting in STDIO mode...');
        const transport = new StdioServerTransport();
        await hub.getServer().connect(transport);
        console.log('MCP Hub is running in STDIO mode');
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

        // MCPエンドポイント
        const transports = new Map<string, StreamableHTTPServerTransport>();

        // セッションマネージャー（内部でクリーンアップを実行）
        const { SessionManager } = await import('../core/session-manager.js');
        const sessionManager = new SessionManager(
          config.session?.ttlSeconds || 3600,
        );

        app.post('/mcp', async (c) => {
          const sessionId = c.req.header('mcp-session-id');
          let transport: StreamableHTTPServerTransport;

          if (sessionId && transports.has(sessionId)) {
            // 既存セッションの有効性を確認
            const session = sessionManager.getSession(sessionId);
            if (!session) {
              // セッションが期限切れの場合、トランスポートも削除
              transports.delete(sessionId);
              return c.json({ error: 'Session expired' }, 401);
            }
            transport = transports.get(
              sessionId,
            ) as StreamableHTTPServerTransport;
          } else {
            transport = new StreamableHTTPServerTransport({
              enableDnsRebindingProtection: true,
              allowedHosts: ['127.0.0.1', 'localhost'],
            });

            // セッションIDが生成されたら保存
            if (transport.sessionId) {
              transports.set(transport.sessionId, transport);
              sessionManager.createSession(transport.sessionId);
            }

            // MCPサーバーに接続
            await hub.getServer().connect(transport);
          }

          // リクエストを処理
          const body = await c.req.json();
          await transport.handleRequest(c.req.raw, c.res, body);
        });

        // SSEエンドポイント
        app.get('/mcp', async (c) => {
          const sessionId = c.req.header('mcp-session-id');
          if (!sessionId || !transports.has(sessionId)) {
            return c.text('Invalid session', 400);
          }

          // セッションの有効性を確認
          const session = sessionManager.getSession(sessionId);
          if (!session) {
            transports.delete(sessionId);
            return c.text('Session expired', 401);
          }

          const transport = transports.get(
            sessionId,
          ) as StreamableHTTPServerTransport;
          await transport.handleRequest(c.req.raw, c.res);
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
            console.log(`MCP Hub is running on http://localhost:${info.port}`);
          },
        );
      }

      // シャットダウンハンドラ
      process.on('SIGINT', async () => {
        console.log('\nShutting down...');
        await hub.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        console.log('\nShutting down...');
        await hub.shutdown();
        process.exit(0);
      });
    } catch (error) {
      console.error('Failed to start server:', error);
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
      console.log(`Creating config file at: ${options.output}`);

      // サンプル設定を生成
      const sample = generateSampleConfig();

      // ファイルに書き込み
      await writeFile(options.output, sample, 'utf-8');

      console.log('Config file created successfully');
      console.log('Edit the file and then run: hatago serve');
    } catch (error) {
      console.error('Failed to create config file:', error);
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
      // 設定を読み込み
      const config = await loadConfig(options.config);

      // MCPハブを作成
      const hub = new McpHub({ config });
      await hub.initialize();

      // ツール一覧を取得
      const _tools = hub.getRegistry().getAllTools();
      const debugInfo = hub.getRegistry().getDebugInfo();

      console.log('\n=== MCP Hub Status ===');
      console.log(`Total servers: ${debugInfo.totalServers}`);
      console.log(`Total tools: ${debugInfo.totalTools}`);
      console.log(`Naming strategy: ${debugInfo.namingStrategy}`);

      if (debugInfo.collisions.length > 0) {
        console.log('\n⚠️  Tool name collisions detected:');
        for (const collision of debugInfo.collisions) {
          console.log(
            `  - ${collision.toolName}: ${collision.serverIds.join(', ')}`,
          );
        }
      }

      console.log('\n=== Available Tools ===');
      for (const tool of debugInfo.tools) {
        console.log(`  ${tool.publicName}`);
        console.log(`    Server: ${tool.serverId}`);
        console.log(`    Original: ${tool.originalName}`);
      }

      // クリーンアップ
      await hub.shutdown();
    } catch (error) {
      console.error('Failed to list tools:', error);
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
      console.error('Failed to reload configuration:', error);
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
      console.error('Failed to get status:', error);
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
      console.error('Failed to manage policy:', error);
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
      console.error('Failed to manage sessions:', error);
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
      console.error('Failed to drain generation:', error);
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
      console.error('Failed to call tool:', error);
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
