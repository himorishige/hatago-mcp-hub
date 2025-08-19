#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { serve } from '@hono/node-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { Command } from 'commander';
import { Hono } from 'hono';
import { generateSampleConfig, loadConfig } from '../config/loader.js';
import { McpHub } from '../core/mcp-hub.js';

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

// コマンドを実行
program.parse(process.argv);
