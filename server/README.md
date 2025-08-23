# Hatago MCP Hub

Lightweight MCP (Model Context Protocol) server management hub - 既存プロジェクトで即座に使用可能

## 🚀 Quick Start (npx)

設定不要で即座に使用開始：

```bash
npx @himorishige/hatago serve
```

## 📦 Installation

### グローバルインストール

```bash
npm install -g @himorishige/hatago
hatago serve
```

### プロジェクトローカル

```bash
npm install @himorishige/hatago
npx hatago serve
```

## 🔧 Claude Code / VS Code統合

`.mcp.json`をプロジェクトルートに作成：

```json
{
  "hatago": {
    "command": "npx",
    "args": ["-y", "@himorishige/hatago@latest", "serve", "--quiet"]
  }
}
```

詳細は[MCP Integration Guide](../docs/mcp-integration.md)を参照してください。

## 📝 Features

- **設定不要**: デフォルト設定で即座に動作
- **プロジェクト非侵襲**: 既存プロジェクトを汚染しません
- **マルチトランスポート**: STDIO (デフォルト) / HTTP / SSE対応
- **リモートMCP対応**: HTTP/SSEリモートサーバーへの接続
- **NPXサーバー管理**: NPXパッケージのMCPサーバーを統合管理

## 🛠️ CLI Commands

### 基本コマンド

```bash
# STDIOモードで起動（デフォルト）
hatago serve

# HTTPモードで起動
hatago serve --http

# 静かなモード（ログ抑制）
hatago serve --quiet

# カスタム設定を使用
hatago serve --config ./my-config.json
```

### MCPサーバー管理（Claude Code互換）

```bash
# ローカルSTDIOサーバー（NPX）
hatago mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/dir

# ローカルNode.jsサーバー
hatago mcp add myserver -- node ./server.js arg1 arg2

# Pythonサーバー（uvx）
hatago mcp add serena -- uvx --from serena-mcp serena-mcp /project/path

# リモートSSEサーバー
hatago mcp add --transport sse linear https://mcp.linear.app/sse

# リモートHTTPサーバー（認証付き）
hatago mcp add --transport http --header "Authorization:Bearer TOKEN" api https://api.example.com/mcp

# 環境変数の設定
hatago mcp add --env API_KEY=secret --env DB_URL=postgres://localhost db -- node ./db-server.js

# サーバー一覧表示
hatago mcp list

# サーバー削除
hatago mcp remove filesystem
```

#### 後方互換性

以前の形式もサポートされています：

```bash
# 引用符で囲む形式（非推奨だが動作する）
hatago mcp add filesystem "npx @modelcontextprotocol/server-filesystem /tmp"
```

### リモートサーバー管理

```bash
# リモートサーバーを追加（個別コマンド）
hatago remote add https://mcp.example.com/sse --id example

# リモートサーバー一覧
hatago remote list

# リモートサーバーを削除
hatago remote remove example
```

### NPXサーバー管理

```bash
# NPXサーバーを追加（個別コマンド）
hatago npx add @modelcontextprotocol/server-filesystem

# NPXサーバー一覧
hatago npx list

# NPXサーバーを起動/停止
hatago npx start filesystem
hatago npx stop filesystem
```

## 📚 Documentation

### ユーザー向け
- [MCP統合ガイド](../docs/mcp-integration.md) - プロジェクトへの統合方法
- [README](README.md) - 基本的な使い方（このドキュメント）

### 開発者向け  
- [実装状況](../docs/implementation-status.md) - 機能の実装状況
- [残存タスク](../docs/remaining-tasks.md) - 技術的課題と改善項目
- [テストガイド](docs/testing-guide.md) - テスト環境構築

## 🔐 Security & Environment Variables

Hatagoは以下の環境変数でセキュリティと動作をカスタマイズできます：

### セキュリティ設定
- `HATAGO_DEBUG_REDACTION=1` - ログサニタイズのデバッグモード（開発時のみ）

### 再接続制限
- `HATAGO_MAX_RECONNECT_DEPTH=32` - 再接続の最大深度（デフォルト: 32）
- `HATAGO_MAX_RECONNECT_STEPS=10000` - 再接続の最大ステップ数（デフォルト: 10000）

### ヘルスチェック
- `HATAGO_HEALTH_TIMEOUT_MS=1000` - ヘルスチェックタイムアウト（デフォルト: 1000ms）

## ⚙️ Configuration (Optional)

Hatagoは設定なしでも動作しますが、カスタマイズも可能です。

設定ファイルの検索順序：
1. `.hatago.json` (カレントディレクトリ)
2. `.hatago.jsonc` (カレントディレクトリ)
3. `.hatago/config.json`
4. `.hatago/config.jsonc`
5. `~/.hatago/config.jsonc` (ユーザーホーム)

### 設定例

#### 最小設定例

`.hatago.json`:
```json
{
  "servers": [
    {
      "id": "deepwiki",
      "type": "remote",
      "url": "https://mcp.deepwiki.com/sse",
      "transport": "sse"
    }
  ]
}
```

#### NPXサーバー設定例

```json
{
  "servers": {
    "filesystem": {
      "id": "filesystem",
      "type": "npx",
      "package": "@modelcontextprotocol/server-filesystem",
      "start": "immediate",
      "initTimeoutMs": 30000,
      "args": ["/Users/username/projects"]
    },
    "github": {
      "id": "github",
      "type": "npx",
      "package": "@modelcontextprotocol/server-github",
      "start": "lazy",
      "args": ["stdio"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    }
  }
}
```

#### セキュリティ設定例

```json
{
  "security": {
    "allowNet": [
      "api.github.com",
      "mcp.deepwiki.com",
      "localhost"
    ],
    "maskedEnvVars": ["GITHUB_TOKEN", "API_KEY", "SECRET"]
  },
  "servers": {
    "remote-api": {
      "id": "remote-api",
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "transport": "http",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

#### 完全な設定例

```json
{
  "http": {
    "port": 3000,
    "host": "localhost"
  },
  "session": {
    "ttl": 3600000,
    "maxSessions": 100
  },
  "security": {
    "allowNet": ["*"]
  },
  "servers": {
    "filesystem": {
      "id": "filesystem",
      "type": "npx",
      "package": "@modelcontextprotocol/server-filesystem",
      "start": "immediate",
      "initTimeoutMs": 30000
    },
    "remote": {
      "id": "remote",
      "type": "remote",
      "url": "https://mcp.example.com/sse",
      "transport": "sse",
      "start": "lazy"
    }
  }
}
```

## 🏗️ Development

```bash
# 開発環境セットアップ
pnpm install
pnpm dev

# ビルド
pnpm build

# テスト
pnpm test
```

## 🧪 Testing

### Local Testing

```bash
# Run unit tests
pnpm test

# Run tests with coverage
pnpm coverage

# Run E2E tests with mock server
pnpm test:e2e
```

### Testing with Mock MCP Server

A mock MCP server is provided for testing:

```bash
# Start mock server (port 4001)
pnpm tsx test/fixtures/mock-mcp-server.ts

# In another terminal, add it to your config
hatago remote add http://localhost:4001/mcp --id mock-test

# Test the connection
hatago remote test mock-test
```

For detailed testing instructions, see [Testing Guide](./docs/testing-guide.md).

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🔗 Links

- [GitHub Repository](https://github.com/himorishige/hatago-hub)
- [MCP Specification](https://modelcontextprotocol.io)
- [npm Package](https://www.npmjs.com/package/@himorishige/hatago)