# Hono MCP Hub Example

分離されたHatagoパッケージとStreamableHTTPTransportを使用したMCP Hubサーバーの実装例です。

## 概要

このExampleは、モノレポ化されたHatagoパッケージの動作検証を目的として作成されました。以下の機能を実証します：

- `@hatago/core` - 型定義の利用
- `@hatago/runtime` - SessionManager、ToolRegistry、ResourceRegistry、McpRouterの統合
- `StreamableHTTPTransport` - MCP仕様準拠のHTTP/SSEトランスポート
- Claude Code互換の設定ファイル形式

## セットアップ

```bash
# ディレクトリに移動
cd examples/hono-mcp-hub

# 依存関係のインストール
pnpm install
```

## 設定ファイル

`hatago-test.config.json`でMCPサーバーを設定します：

```json
{
  "version": 1,
  "logLevel": "debug",
  "mcpServers": {
    "test-server": {
      "command": "node",
      "args": ["./test-mcp-server.js"],
      "hatagoOptions": {
        "start": "eager"  // eager: 起動時に接続, lazy: 初回使用時に接続
      }
    }
  }
}
```

## 起動

```bash
# 開発サーバー（ホットリロード付き）
pnpm dev

# ビルド
pnpm build

# 本番サーバー
pnpm start
```

## API エンドポイント

### MCP Streamable HTTP (メインエンドポイント)

#### POST /mcp
JSON-RPC 2.0リクエストを処理します。

```bash
# 初期化
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "1.0.0",
      "capabilities": {}
    }
  }'

# レスポンスのmcp-session-idヘッダーを保存してください
```

#### GET /mcp  
SSEストリーム接続を確立します。

```bash
curl -N -H "Accept: text/event-stream" \
  -H "mcp-session-id: <session-id>" \
  http://localhost:8787/mcp
```

#### DELETE /mcp
セッションを終了します。

```bash
curl -X DELETE http://localhost:8787/mcp \
  -H "mcp-session-id: <session-id>"
```

### 補助エンドポイント

#### GET /health
サーバーの状態を確認します。

```bash
curl http://localhost:8787/health
```

#### GET /sessions
アクティブなセッション一覧を取得します。

```bash
curl http://localhost:8787/sessions
```

#### GET /tools
利用可能なツール一覧を取得します。

```bash
curl "http://localhost:8787/tools?sessionId=default"
```

#### GET /resources
利用可能なリソース一覧を取得します。

```bash
curl "http://localhost:8787/resources?sessionId=default"
```

#### GET /metrics
サーバーメトリクスを取得します（開発環境のみ）。

```bash
curl http://localhost:8787/metrics
```

## MCP プロトコルテスト

### ツール一覧の取得

```bash
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "mcp-session-id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/list"
  }'
```

### ツールの実行

```bash
# Echo tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "mcp-session-id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 3,
    "method": "tools/call",
    "params": {
      "name": "echo",
      "arguments": {
        "message": "Hello, Hatago!"
      }
    }
  }'

# Get time tool
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "mcp-session-id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 4,
    "method": "tools/call",
    "params": {
      "name": "get_time",
      "arguments": {
        "format": "human"
      }
    }
  }'
```

### リソースの読み取り

```bash
# リソース一覧
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "mcp-session-id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 5,
    "method": "resources/list"
  }'

# リソース読み取り
curl -X POST http://localhost:8787/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "mcp-session-id: <session-id>" \
  -d '{
    "jsonrpc": "2.0",
    "id": 6,
    "method": "resources/read",
    "params": {
      "uri": "test://readme"
    }
  }'
```

## MCP Inspector との接続

[MCP Inspector](https://inspector.modelcontextprotocol.io/)を使用して接続する場合：

1. MCP Inspector を開く
2. Connection Settings:
   - Connection Type: `HTTP + Server-Sent Events`
   - URL: `http://localhost:8787/mcp`
3. "Connect" をクリック
4. 接続成功後、ツールやリソースの一覧が表示されます

## アーキテクチャ

```
┌─────────────────┐     ┌──────────────────┐     ┌───────────────┐
│  AI Client      │────▶│  Hono App        │────▶│  MCP Servers  │
│  (MCP Inspector)│     │                  │     │               │
│                 │     │  /mcp endpoint   │     │  test-server  │
│                 │◀────│  (StreamableHTTP)│◀────│  deepwiki     │
└─────────────────┘     └──────────────────┘     │  everything   │
                                                  └───────────────┘

Packages Used:
- @hatago/core: Type definitions
- @hatago/runtime: Session, Registry, Router
- StreamableHTTPTransport: MCP protocol implementation
```

## トラブルシューティング

### ポート8787が使用中の場合

```bash
PORT=3001 pnpm dev
```

### デバッグモードで起動

```bash
NODE_ENV=development pnpm dev
```

### ログレベルを変更

`hatago-test.config.json`で`logLevel`を調整：
- `debug`: 詳細なログ
- `info`: 通常のログ
- `warn`: 警告のみ
- `error`: エラーのみ

## 開発のポイント

このExampleで検証できる主な機能：

1. **パッケージ統合**: 分離されたパッケージが正しく連携
2. **StreamableHTTPTransport**: MCP仕様準拠の通信
3. **セッション管理**: 複数クライアントの独立したセッション
4. **ツール/リソース登録**: 動的な機能拡張
5. **エラーハンドリング**: JSON-RPC 2.0準拠のエラー処理
6. **SSEサポート**: 長時間実行操作の進捗通知

## ライセンス

MIT