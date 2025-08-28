# 🏮 Hatago MCP Hub

> **Hatago (旅籠)** - 江戸時代の宿場町で旅人を泊める宿。現代のAIツールとMCPサーバーをつなぐ中継地点。

## 概要

Hatago MCP Hubは、複数のMCP（Model Context Protocol）サーバーを統合管理する軽量なハブサーバーです。Claude Code、Cursor、VS Codeなどの開発ツールから、様々なMCPサーバーを一元的に利用できます。

## ✨ 特徴

### 🎯 シンプル & 軽量

- **設定不要で即座に起動** - `npx @hatago/cli serve`
- **既存プロジェクトに非侵襲** - プロジェクトディレクトリを汚染しません
- **モジュラー設計** - 必要な機能だけを選択して利用可能

### 🔌 豊富な接続性

- **マルチトランスポート対応** - STDIO / HTTP / SSE / WebSocket
- **リモートMCPプロキシ** - HTTPベースのMCPサーバーへの透過的な接続
- **NPXサーバー統合** - npmパッケージのMCPサーバーを動的に管理

### 🛡️ エンタープライズ対応

- **セッション管理** - 独立したAIクライアントセッション
- **エラーリカバリ** - サーキットブレーカー、リトライ機構
- **観測性** - 構造化ログ、メトリクス、診断ツール

## 📦 インストール

```bash
# CLIツール（推奨）
npm install -g @hatago/cli

# またはプロジェクトローカル
npm install @hatago/cli

# またはnpxで直接実行
npx @hatago/cli serve

# 開発者向けパッケージ
npm install @hatago/core    # 型定義
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
pnpm build

# テスト実行
pnpm test

# 開発サーバー起動
pnpm dev
```

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
