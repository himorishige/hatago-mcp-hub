# 🏮 Hatago MCP Hub

> **Hatago (旅籠)** - 江戸時代の宿場町で旅人を泊める宿。現代のAIツールとMCPサーバーをつなぐ中継地点。

## 概要

Hatago MCP Hubは、複数のMCP（Model Context Protocol）サーバーを統合管理する軽量なハブサーバーです。Claude Code、Cursor、VS Codeなどの開発ツールから、様々なMCPサーバーを一元的に利用できます。

## ✨ 特徴

### 🎯 シンプル & 軽量

- **設定不要で即座に起動** - `npx @himorishige/hatago-mcp-hub`
- **既存プロジェクトに非侵襲** - プロジェクトディレクトリを汚染しません
- **モジュラー設計** - 必要な機能だけを選択して利用可能

### 🔌 豊富な接続性

- **マルチトランスポート対応** - STDIO / HTTP / SSE / WebSocket
- **リモートMCPプロキシ** - HTTPベースのMCPサーバーへの透過的な接続
- **NPXサーバー統合** - npmパッケージのMCPサーバーを動的に管理

### 🛡️ エンタープライズ対応

- **セッション管理** - 独立したAIクライアントセッション
- **エラーリカバリ** - サーキットブレーカー、リトライ機構
- **進捗通知** - SSEによるリアルタイムプログレス通知
- **観測性** - 構造化ログ、メトリクス、診断ツール

### 🔧 新機能 (v0.3.0)

#### ホットリロード & 動的更新

- **設定ファイル監視** - 設定変更時の自動リロード（再起動不要）
- **グレースフルな再接続** - セッション維持しながらサーバー再接続
- **ツールリスト動的更新** - `notifications/tools/list_changed`通知サポート
- **1秒デバウンス** - 高速な連続変更をバッチ処理

#### プログレス通知転送

- **子サーバー通知転送** - `notifications/progress`の透過的な転送
- **長時間実行操作対応** - リアルタイムな進捗更新
- **ローカル/リモート両対応** - すべてのMCPサーバータイプで動作

#### 内部管理ツール

- **`_internal_hatago_status`** - 全サーバーの接続状態とツール数を確認
- **`_internal_hatago_reload`** - 手動での設定リロードトリガー
- **`_internal_hatago_list_servers`** - 設定済みサーバーの詳細リスト

#### プロトコル準拠の改善

- **適切なSTDIO実装** - 改行区切りJSON（LSPヘッダーではなくMCP標準）
- **通知フォーマット修正** - 通知メッセージに`id`フィールドを含めない
- **JSON-RPC 2.0準拠** - 完全な仕様準拠

#### 既存機能の改善

- **環境変数展開** - Claude Code互換の`${VAR}`と`${VAR:-default}`構文
- **設定検証** - Zodスキーマによる型安全な設定
- **ツールバージョニング** - ハッシュベースの変更検出

## 📦 インストール

```bash
# CLIツール（推奨）
npm install -g @hatago/cli

# またはプロジェクトローカル
npm install @hatago/cli

# またはnpxで直接実行
npx @hatago/cli serve

# プログラム的に使用する場合
npm install @hatago/server   # サーバーAPI
npm install @hatago/core     # 型定義
npm install @hatago/runtime  # ランタイムコンポーネント
npm install @hatago/transport # トランスポート実装
```

## 🚀 クイックスタート

### Claude Code / VS Code統合

プロジェクトルートに`.mcp.json`を作成：

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": ["-y", "@hatago/cli@latest", "serve", "--quiet"]
    }
  }
}
```

### MCPサーバーの追加

```bash
# Claude Code互換コマンド（推奨）
hatago mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /path/to/dir

# リモートサーバーの追加（SSE）
hatago mcp add --transport sse linear https://mcp.linear.app/sse

# リモートサーバーの追加（HTTP）
hatago mcp add --transport http deepwiki https://mcp.deepwiki.com

# 登録済みサーバーの確認
hatago mcp list

# サーバーの削除
hatago mcp remove filesystem
```

### 設定ファイル例

`hatago.config.json`:

```json
{
  "version": 1,
  "logLevel": "info",
  "notifications": {
    "enabled": true,
    "rateLimitSec": 60,
    "severity": ["warn", "error"]
  },
  "mcpServers": {
    "filesystem": {
      "type": "local",
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "disabled": false,
      "timeouts": {
        "connectMs": 5000,
        "requestMs": 30000,
        "keepAliveMs": 60000
      }
    },
    "github": {
      "type": "local",
      "command": "${MCP_PATH}/github-server",
      "args": ["--token", "${GITHUB_TOKEN}"],
      "env": {
        "LOG_LEVEL": "${LOG_LEVEL:-info}"
      }
    },
    "api-server": {
      "type": "remote",
      "url": "${API_BASE_URL:-https://api.example.com}/mcp",
      "headers": {
        "Authorization": "Bearer ${API_KEY}"
      }
    }
  }
}
```

環境変数の展開がサポートされており、以下の構文が使えます：

- `${VAR}` - 環境変数VARの値に展開（未定義の場合はエラー）
- `${VAR:-default}` - VARが未定義の場合はdefaultを使用

### 開発モード起動

```bash
# 設定ファイル監視モード（ホットリロード）
hatago serve --http --config hatago.config.json --watch

# HTTPモードでデバッグ
hatago serve --http --port 3929 --log-level debug
```

## 📚 ドキュメント

### 🎯 ユーザー向け

- [**詳細README**](server/README.md) - CLIコマンドリファレンス
- [**設定ガイド**](docs/configuration.md) - 設定ファイルとオプション

### 🔧 開発者向け

- [**アーキテクチャガイド**](docs/architecture.md) - システム設計とプラットフォーム抽象化
- [**パッケージ開発**](docs/packages.md) - モジュール開発ガイド
- [**API リファレンス**](docs/api.md) - パッケージAPI詳細

## 🏗️ アーキテクチャ

### モノレポ構造

```
hatago-hub/
├── packages/
│   ├── @hatago/core/      # 型定義とインターフェース
│   ├── @hatago/runtime/   # セッション、レジストリ、ルーター
│   ├── @hatago/transport/ # トランスポート実装
│   └── @hatago/cli/       # CLIコマンド
└── server/                # MCP Hub サーバー本体
```

### システム構成

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   AI Tools  │────▶│  Hatago Hub  │────▶│  MCP Servers   │
│ Claude Code │     │              │     │                │
│   Cursor    │     │   - Router   │     │ - Filesystem   │
│   VS Code   │     │   - Registry │     │ - GitHub       │
└─────────────┘     │   - Session  │     │ - Database     │
                    └──────────────┘     │ - Custom       │
                                         └────────────────┘
```

### パッケージ依存関係

```
@hatago/core (純粋な型定義)
     ↑
@hatago/runtime (セッション・レジストリ管理)
     ↑
@hatago/transport (通信レイヤー)
     ↑
@hatago/cli (CLIコマンド)
     ↑
server (Hatagoサーバー本体)
```

### マルチランタイム対応

Hatagoは、プラットフォーム抽象化レイヤーにより複数のJavaScriptランタイムをサポート：

- **Node.js** - フル機能（ローカル/NPX/リモートサーバー）
- **Cloudflare Workers** - リモートサーバーのみ（KVストレージ）
- **Deno** - Node.js実装を使用（ネイティブ対応予定）
- **Bun** - Node.js実装を使用（最適化予定）

## 🛠️ 技術スタック

- **Runtime**: Node.js 20+ / Bun / Deno / Cloudflare Workers
- **Framework**: [Hono](https://hono.dev/) - 軽量Webフレームワーク
- **Protocol**: [MCP](https://modelcontextprotocol.io/) - Model Context Protocol
- **Language**: TypeScript (ESM)
- **Build**: tsdown
- **Test**: Vitest
- **Lint/Format**: Biome
- **Package Manager**: pnpm (モノレポ管理)

## 🤝 コントリビューション

現在プライベート開発中ですが、将来的にはオープンソース化を予定しています。

### 開発セットアップ

```bash
# リポジトリのクローン
git clone https://github.com/himorishige/hatago-hub.git
cd hatago-hub

# 依存関係のインストール
pnpm install

# ビルド
pnpm -r build

# テスト実行
pnpm test

# 開発サーバー起動（packages/serverディレクトリで実行）
cd packages/server
pnpm dev
```

### パッケージ構成

- `@hatago/cli` - CLIツール（エントリーポイント）
- `@hatago/server` - MCPハブサーバー実装
- `@hatago/core` - 共通型定義とインターフェース
- `@hatago/runtime` - ランタイムコンポーネント
- `@hatago/transport` - トランスポート層実装

## 📝 ライセンス

MIT License

## 🙏 謝辞

- [Anthropic MCP Team](https://github.com/modelcontextprotocol) - MCPプロトコルの設計と実装
- [Hono](https://hono.dev/) - 優れたWebフレームワーク
- すべてのコントリビューターとユーザーの皆様

---

<div align="center">
  <i>「旅人よ、ここで一息つきたまえ」</i><br>
  <sub>Built with ❤️ by the Hatago Team</sub>
</div>
