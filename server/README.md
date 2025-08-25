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

### 🏗️ 核心機能
- **設定不要**: デフォルト設定で即座に動作
- **プロジェクト非侵襲**: 既存プロジェクトを汚染しません
- **プロキシアーキテクチャ**: 統合されたMCPサーバー管理とCapability Graph
- **マルチトランスポート**: STDIO (デフォルト) / HTTP / SSE / WebSocket対応
- **ホットリロード**: 設定変更時の自動再読み込み

### 🛡️ セキュリティ & 信頼性
- **認証・認可**: 柔軟な権限管理システム
- **レート制限**: サーバー保護とリソース管理
- **サーキットブレーカー**: 障害時の自動復旧機能
- **ログサニタイズ**: 機密情報の自動マスキング

### 📊 観測可能性
- **分散トレーシング**: リクエスト追跡とパフォーマンス分析
- **メトリクス収集**: Prometheus互換メトリクス
- **ヘルスチェック**: Kubernetes互換のliveness/readiness probe
- **構造化ログ**: JSON形式での詳細ログ出力

### 👨‍💻 開発者体験
- **TypeScript型生成**: MCPサーバーからの自動型生成
- **開発サーバー**: ファイル監視とホットリロード機能
- **OpenAPI統合**: REST API ⇔ MCP双方向変換
- **デコレーターAPI**: 宣言的なMCPサーバー定義（実験的）
- **テストユーティリティ**: モックサーバーとテストクライアント

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

### 開発ツール

```bash
# 開発サーバー（ファイル監視 + ホットリロード）
hatago dev ./my-server.js

# MCPサーバー調査
hatago inspect @modelcontextprotocol/server-filesystem

# TypeScript型生成
hatago generate types ./types/mcp-servers.d.ts

# OpenAPI仕様からMCPツール生成
hatago generate mcp --from-openapi ./api.yaml
```

### システム監視

```bash
# ヘルスチェック
hatago health

# メトリクス表示
hatago metrics

# ログ監視
hatago logs --follow

# トレース情報表示
hatago trace <trace-id>
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
- [アーキテクチャガイド](./docs/architecture.md) - システム設計と内部構造
- [開発者ガイド](./docs/developer-guide.md) - 型生成・デコレーターAPI・テスト
- [観測可能性ガイド](./docs/observability.md) - トレーシング・メトリクス・ログ
- [セキュリティガイド](./docs/security.md) - 認証・認可・レート制限

### 運用・管理
- [テストガイド](./docs/testing-guide.md) - テスト環境構築
- [開発ロードマップ](./docs/roadmap.md) - 機能計画と実装状況

## 🔐 Security & Environment Variables

Hatagoは以下の環境変数でセキュリティと動作をカスタマイズできます：

### セキュリティ設定
- `HATAGO_DEBUG_REDACTION=1` - ログサニタイズのデバッグモード（開発時のみ）
- `HATAGO_AUTH_SECRET` - JWT認証のシークレットキー
- `HATAGO_RATE_LIMIT_WINDOW=60000` - レート制限ウィンドウ（デフォルト: 60秒）
- `HATAGO_RATE_LIMIT_MAX=1000` - レート制限最大リクエスト数（デフォルト: 1000）

### 観測可能性
- `HATAGO_TRACING_ENABLED=true` - 分散トレーシングの有効化
- `HATAGO_METRICS_ENABLED=true` - メトリクス収集の有効化
- `HATAGO_METRICS_PORT=9090` - メトリクスエクスポートポート
- `HATAGO_LOG_LEVEL=info` - ログレベル（debug, info, warn, error）

### パフォーマンス
- `HATAGO_MAX_RECONNECT_DEPTH=32` - 再接続の最大深度（デフォルト: 32）
- `HATAGO_MAX_RECONNECT_STEPS=10000` - 再接続の最大ステップ数（デフォルト: 10000）
- `HATAGO_CIRCUIT_BREAKER_THRESHOLD=5` - サーキットブレーカー閾値
- `HATAGO_HEALTH_TIMEOUT_MS=1000` - ヘルスチェックタイムアウト（デフォルト: 1000ms）

### 開発モード
- `HATAGO_DEV_MODE=true` - 開発モードの有効化
- `HATAGO_HOT_RELOAD=true` - ホットリロードの有効化
- `HATAGO_TYPE_GENERATION=true` - 自動型生成の有効化

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
    "allowNet": ["*"],
    "maskedEnvVars": ["GITHUB_TOKEN", "API_KEY"],
    "authentication": {
      "enabled": true,
      "secret": "${HATAGO_AUTH_SECRET}",
      "algorithms": ["HS256"]
    },
    "rateLimit": {
      "windowMs": 60000,
      "max": 1000,
      "skipSuccessfulRequests": false
    }
  },
  "observability": {
    "tracing": {
      "enabled": true,
      "serviceName": "hatago-hub",
      "exportInterval": 5000
    },
    "metrics": {
      "enabled": true,
      "port": 9090,
      "path": "/metrics"
    },
    "logging": {
      "level": "info",
      "format": "json",
      "sanitize": true
    }
  },
  "proxy": {
    "circuitBreaker": {
      "failureThreshold": 5,
      "resetTimeoutMs": 30000
    },
    "cache": {
      "enabled": false,
      "ttl": 300000
    }
  },
  "development": {
    "hotReload": true,
    "typeGeneration": {
      "enabled": true,
      "outputPath": "./types/generated.d.ts"
    }
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
      "start": "lazy",
      "healthCheck": {
        "enabled": true,
        "interval": 30000
      }
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