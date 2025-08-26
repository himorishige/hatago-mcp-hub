# Hatago MCP Hub (Lite)

Ultra-lightweight MCP (Model Context Protocol) server management hub - シンプルで高速な実装

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

### 🏗️ 核心機能 (Lite版)

- **設定不要**: デフォルト設定で即座に動作
- **軽量実装**: 最小限の依存関係で高速動作
- **プロジェクト非侵襲**: 既存プロジェクトを汚染しません
- **マルチサーバー管理**: NPX/Remote/Localサーバーの統合管理
- **マルチトランスポート**: STDIO (デフォルト) / HTTP / SSE対応
- **セッション管理**: 複数のAIクライアントから独立接続

### 🛡️ 基本的なセキュリティ

- **エラーハンドリング**: 堅牢なエラー処理とリカバリー
- **環境変数マスキング**: 機密情報の保護
- **基本的なログ出力**: デバッグ用のシンプルなログ

### 👨‍💻 シンプルな開発体験

- **TypeScript対応**: 完全な型サポート
- **CLIツール**: 直感的なコマンドライン管理
- **設定ファイル**: JSONベースの簡単な設定

## 🛠️ CLI Commands

### サーバー管理

```bash
# STDIOモードで起動（デフォルト）
hatago serve

# HTTPモードで起動
hatago serve --http

# 静かなモード（ログ抑制）
hatago serve --quiet

# カスタム設定を使用
hatago serve --config ./my-config.json

# サーバー状態確認
hatago status

# 設定のリロード
hatago reload
```

### 基本的な管理コマンド

```bash
# サーバーの状態確認
hatago status

# 設定のリロード
hatago reload
```

### MCPサーバー管理（Claude Code互換）

```bash
# ローカルコマンドサーバー（Node.js）
hatago mcp add myserver -- node ./server.js arg1 arg2

# ローカルコマンドサーバー（Python）
hatago mcp add python-server -- python ./server.py --port 3001

# ローカルコマンドサーバー（Deno）
hatago mcp add deno-server -- deno run --allow-net ./server.ts

# NPXパッケージサーバー
hatago mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/dir

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

- [README](README.md) - 基本的な使い方（このドキュメント）
- [MCP統合ガイド](../docs/mcp-integration.md) - プロジェクトへの統合方法
- [設定リファレンス](./docs/configuration.md) - 詳細な設定オプション

### 開発者向け

- [アーキテクチャガイド](./docs/architecture.md) - Lite版のシンプルな構造
- [開発者ガイド](./docs/developer-guide.md) - 基本的な開発方法

## 🔐 Environment Variables

Hatago Liteは以下の環境変数でカスタマイズできます：

### 基本設定

- `LOG_LEVEL=info` - ログレベル（debug, info, warn, error）
- `HATAGO_CONFIG` - 設定ファイルのパス
- `PORT=3000` - HTTPモードでのポート番号

### デバッグ

- `DEBUG=hatago:*` - デバッグログの有効化

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

#### ローカルコマンドサーバー設定例

```json
{
  "servers": {
    "local-node": {
      "id": "local-node",
      "type": "local",
      "command": "node",
      "args": ["./my-mcp-server.js"],
      "cwd": "/path/to/server",
      "start": "lazy",
      "env": {
        "DEBUG": "true"
      }
    },
    "local-python": {
      "id": "local-python",
      "type": "local",
      "command": "python",
      "args": ["./server.py", "--port", "3001"],
      "start": "immediate"
    }
  }
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
    "allowNet": ["api.github.com", "mcp.deepwiki.com", "localhost"],
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

#### Lite版の標準設定例

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
  "servers": {
    "filesystem": {
      "id": "filesystem",
      "type": "npx",
      "package": "@modelcontextprotocol/server-filesystem",
      "start": "immediate",
      "initTimeoutMs": 30000,
      "args": ["/path/to/directory"]
    },
    "local-node": {
      "id": "local-node",
      "type": "local",
      "command": "node",
      "args": ["./examples/test-mcp-server.js"],
      "cwd": "./",
      "start": "lazy",
      "env": {
        "DEBUG": "true"
      }
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

# 開発サーバー起動
pnpm dev

# ファイル監視 + 型生成
hatago dev --generate-types

# ビルド
pnpm build

# コード品質チェック
pnpm format && pnpm lint && pnpm check

# テスト実行
pnpm test

# カバレッジ付きテスト
pnpm coverage
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
