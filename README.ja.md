[English](./README.md) | **日本語**

# 🏮 Hatago MCP Hub

[![npm](https://img.shields.io/npm/v/@himorishige/hatago-mcp-hub?logo=npm&color=cb0000)](https://www.npmjs.com/package/@himorishige/hatago-mcp-hub)
[![GitHub Release](https://img.shields.io/github/v/release/himorishige/hatago-mcp-hub?display_name=tag&sort=semver)](https://github.com/himorishige/hatago-mcp-hub/releases)
[![Ask DeepWiki](https://deepwiki.com/badge.svg)](https://deepwiki.com/himorishige/hatago-mcp-hub)

> **Hatago (旅籠)** - 江戸時代の宿場町で旅人を泊める宿。現代のAIツールとMCPサーバーをつなぐ中継地点。

## 概要

Hatago MCP Hubは、複数のMCP（Model Context Protocol）サーバーを統合管理する軽量なハブサーバーです。Claude Code、Codex CLI、Cursor、Windsurf、VS Codeなどの開発ツールから、さまざまなMCPサーバーを一元的に利用できます。

## ✨ 特徴

### 🎯 シンプル & 軽量

- **設定不要で即座に起動** - `npx @himorishige/hatago-mcp-hub`
- **既存プロジェクトに非侵襲** - プロジェクトディレクトリを汚染しません

### 🔌 豊富な接続性

- **マルチトランスポート対応** - STDIO / HTTP / SSE / WebSocket
- **リモートMCPプロキシ** - HTTPベースのMCPサーバーへの透過的な接続
- **NPXサーバー統合** - npmパッケージのMCPサーバーを動的に管理

### 🏮 その他の機能

#### ホットリロード & 動的更新

- **設定ファイル監視** - 設定変更時の自動リロード（再起動不要）
- **ツールリスト動的更新** - `notifications/tools/list_changed`通知サポート

#### プログレス通知転送

- **子サーバー通知転送** - `notifications/progress`の透過的な転送
- **長時間実行操作対応** - リアルタイムな進捗更新
- **ローカル/リモート両対応** - 多くのMCPサーバータイプで動作

#### 内部管理ツール

- **`_internal_hatago_status`** - 全サーバーの接続状態とツール数を確認
- **`_internal_hatago_reload`** - 手動での設定リロードトリガー
- **`_internal_hatago_list_servers`** - 設定済みサーバーの詳細リスト

#### 既存機能の改善

- **環境変数展開** - Claude Code互換の`${VAR}`と`${VAR:-default}`構文
- **設定検証** - Zodスキーマによる型安全な設定
- **タグベースフィルタリング** - タグによるサーバーのグループ化とフィルタリング
- **設定ファイル継承** - `extends`フィールドによる設定の継承とDRY原則の実現

## 📦 インストール

```bash
# npxで直接実行（推奨）
npx @himorishige/hatago-mcp-hub init    # 設定ファイル生成
npx @himorishige/hatago-mcp-hub serve   # サーバー起動

# グローバルインストール
npm install -g @himorishige/hatago-mcp-hub
hatago init
hatago serve

# プロジェクトローカル
npm install @himorishige/hatago-mcp-hub
```

## 🚀 クイックスタート

### 初期設定

```bash
# 対話的な設定ファイル生成
npx @himorishige/hatago-mcp-hub init

# モード指定での生成
npx @himorishige/hatago-mcp-hub init --mode stdio  # STDIOモード
npx @himorishige/hatago-mcp-hub init --mode http   # StreamableHTTPモード
```

### STDIOモードでの設定例

#### Claude Code、Gemini CLI

`.mcp.json`に以下を追加：

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": [
        "@himorishige/hatago-mcp-hub",
        "serve",
        "--stdio",
        "--config",
        "/path/to/hatago.config.json"
      ]
    }
  }
}
```

#### Codex CLI

`~/.codex/config.toml`に以下を追加：

```toml
[mcp_servers.hatago]
command = "npx"
args = ["-y", "@himorishige/hatago-mcp-hub", "serve", "--stdio", "--config", "/path/to/hatago.config.json"]
```

### StreamableHTTPモードでの設定例

#### HTTPモード起動

```bash
hatago serve --http --config /path/to/hatago.config.json
```

#### Claude Code、Gemini CLI

`.mcp.json`に以下を追加：

```json
{
  "mcpServers": {
    "hatago": {
      "url": "http://localhost:3535/mcp"
    }
  }
}
```

#### Codex CLI

2026年8月現在、Codex CLIはSTDIOモードのみサポートのため、[mcp-remote](https://github.com/geelen/mcp-remote)を使用

`~/.codex/config.toml`に以下を追加：

```toml
[mcp_servers.hatago]
command = "npx"
args = ["-y", "mcp-remote", "http://localhost:3535/mcp"]
```

### サーバー起動

```bash
# STDIOモード
hatago serve --stdio

# HTTPモード
hatago serve --http

# 設定ファイル監視モード
hatago serve --stdio --watch

# カスタム設定ファイル
hatago serve --config ./my-config.json

# タグでサーバーをフィルタリング
hatago serve --tags dev,test      # dev または test タグを持つサーバーのみ起動
hatago serve --tags 開発,テスト    # 日本語タグもサポート
```

### 設定戦略

#### 戦略1: タグベースフィルタリング

単一の設定ファイルでタグを使ってサーバーをグループ化：

```json
{
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"],
      "env": {
        "LOG_LEVEL": "${LOG_LEVEL:-info}"
      }
    },
    "deepwiki": {
      "url": "https://mcp.deepwiki.com/sse",
      "type": "sse"
    },
    "github": {
      "command": "${MCP_PATH}/github-server",
      "args": ["--token", "${GITHUB_TOKEN}"]
    },
    "api-server": {
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

#### 戦略2: 設定継承

`extends`フィールドを使用して環境ごとに設定を分割：

**ベース設定** (`~/.hatago/base.config.json`)：

```json
{
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "github": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-github"],
      "env": {
        "GITHUB_TOKEN": "${GITHUB_TOKEN}"
      }
    },
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."]
    }
  }
}
```

**仕事用設定** (`./work.config.json`)：

```json
{
  "extends": "~/.hatago/base.config.json",
  "logLevel": "debug",
  "mcpServers": {
    "github": {
      "env": {
        "GITHUB_TOKEN": "${WORK_GITHUB_TOKEN}",
        "DEBUG": null
      }
    },
    "internal-tools": {
      "url": "https://internal.company.com/mcp",
      "type": "http",
      "headers": {
        "Authorization": "Bearer ${INTERNAL_TOKEN}"
      }
    }
  }
}
```

機能：

- **継承**: 子設定が親の値を上書き
- **複数の親**: `"extends": ["./base1.json", "./base2.json"]`
- **パス解決**: `~`、相対パス、絶対パスをサポート
- **環境変数削除**: `null`を使用して継承された環境変数を削除

#### 戦略の選択

| 戦略           | タグベース                 | 継承ベース                   |
| -------------- | -------------------------- | ---------------------------- |
| **ファイル数** | 単一設定                   | 複数設定                     |
| **切り替え**   | `--tags`オプション         | `--config`オプション         |
| **管理**       | 中央集権的                 | 分散的                       |
| **最適な用途** | チーム共有、シンプルな設定 | 複雑な環境、個人カスタマイズ |

### タグベースのサーバーフィルタリング

環境や用途に応じてサーバーをグループ化できます：

```json
{
  "mcpServers": {
    "filesystem-dev": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "tags": ["dev", "local", "開発"]
    },
    "github-prod": {
      "url": "https://api.github.com/mcp",
      "type": "http",
      "tags": ["production", "github", "本番"]
    },
    "database": {
      "command": "mcp-server-postgres",
      "tags": ["dev", "production", "database", "データベース"]
    }
  }
}
```

特定のタグを持つサーバーのみを起動：

```bash
# 開発環境用のサーバーのみ起動
hatago serve --tags dev

# 本番またはステージング環境用
hatago serve --tags production,staging

# 日本語タグでの指定
hatago serve --tags 開発,テスト
```

### MCP Inspectorでのテスト

```bash
# HTTPモードで起動
hatago serve --http --port 3535

# MCP Inspectorで接続
# URL: http://localhost:3535/mcp
```

## 📚 ドキュメント

### 🎯 ユーザー向け

- [**パッケージREADME**](packages/mcp-hub/README.md) - npmパッケージドキュメント
- [**設定スキーマ**](schemas/config.schema.json) - 設定ファイルのJSON Schema

### 🔧 開発者向け

- [**アーキテクチャガイド**](docs/architecture.md) - システム設計とプラットフォーム抽象化
- [**チーム開発ユースケース**](docs/use-cases/team-development.md) - 継承機能を使ったチーム開発環境の構築

## 🏗️ アーキテクチャ

### モノレポ構造

```
hatago-mcp-hub/
├── packages/
│   ├── mcp-hub/        # メインパッケージ（リリース対象）
│   ├── server/         # サーバー実装
│   ├── core/           # 型定義とインターフェース
│   ├── runtime/        # セッション、レジストリ、ルーター
│   ├── transport/      # トランスポート実装
│   ├── hub/            # Hubコア実装
│   └── cli/            # CLIコマンド（開発中）
└── schemas/            # JSON Schema定義
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
@himorishige/hatago-core (純粋な型定義)
     ↑
@himorishige/hatago-runtime (セッション・レジストリ管理)
     ↑
@himorishige/hatago-transport (通信レイヤー)
     ↑
@himorishige/hatago-hub (Hubコア実装)
     ↑
@himorishige/hatago-server (サーバー本体)
     ↑
@himorishige/hatago-mcp-hub (メインパッケージ)
```

### マルチランタイム対応

Hatagoは、プラットフォーム抽象化レイヤーにより複数のJavaScriptランタイムをサポート：

- **Node.js** - フル機能（ローカル/NPX/リモートサーバー）
- **Cloudflare Workers** - リモートサーバーのみ（KVストレージ）
- **Deno** - WIP
- **Bun** - WIP

## 🛠️ 技術スタック

- **Runtime**: Node.js 20+ / Cloudflare Workers
- **Framework**: [Hono](https://hono.dev/) - 軽量Webフレームワーク
- **Protocol**: [MCP](https://modelcontextprotocol.io/) - Model Context Protocol
- **Language**: TypeScript (ESM)
- **Build**: tsdown
- **Test**: Vitest
- **Lint/Format**: ESLint / Prettier
- **Package Manager**: pnpm (モノレポ管理)

## 🤝 コントリビューション

Hatagoは、オープンソースで開発されています。

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

# 開発サーバー起動
cd packages/mcp-hub
pnpm dev

# または
npx . serve --http --watch
```

### パッケージ構成

- `@himorishige/hatago-mcp-hub` - メインパッケージ（npmリリース対象）
- `@himorishige/hatago-server` - MCPハブサーバー実装
- `@himorishige/hatago-hub` - Hubコア機能
- `@himorishige/hatago-core` - 共通型定義とインターフェース
- `@himorishige/hatago-runtime` - ランタイムコンポーネント
- `@himorishige/hatago-transport` - トランスポート層実装
- `@himorishige/hatago-cli` - CLIツール（開発中）

## 📝 ライセンス

MIT License

## 🙏 謝辞

- [Hono](https://hono.dev/) - 優れたWebフレームワーク
- [Model Context Protocol SDK](https://github.com/modelcontextprotocol) - MCPプロトコルの設計と実装
- すべてのコントリビューターとユーザーの皆様

---

<div align="center">
  <i>「旅人よ、ここで一息つきたまえ」</i><br>
  <sub>Built with ❤️ by the Hatago Team</sub>
</div>
