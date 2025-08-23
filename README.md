# 🏮 Hatago MCP Hub

> **Hatago (旅籠)** - 江戸時代の宿場町で旅人を泊める宿。現代のAIツールとMCPサーバーをつなぐ中継地点。

## 概要

Hatago MCP Hubは、複数のMCP（Model Context Protocol）サーバーを統合管理する軽量なハブサーバーです。Claude Code、Cursor、VS Codeなどの開発ツールから、様々なMCPサーバーを一元的に利用できます。

## ✨ 特徴

### 🎯 シンプル & 軽量
- **設定不要で即座に起動** - `npx @himorishige/hatago serve`
- **既存プロジェクトに非侵襲** - プロジェクトディレクトリを汚染しません
- **最小限の依存関係** - Hono + MCP SDKのみ

### 🔌 豊富な接続性
- **マルチトランスポート対応** - STDIO / HTTP / Streamable HTTP
- **リモートMCPプロキシ** - HTTPベースのMCPサーバーへの透過的な接続
- **NPXサーバー統合** - npmパッケージのMCPサーバーを動的に管理

### 🛡️ エンタープライズ対応
- **セキュリティ機能** - ツール実行ポリシー、PII自動マスク、暗号化シークレット管理
- **高可用性** - 自動再起動、ヘルスチェック、グレースフルシャットダウン
- **観測性** - 構造化ログ、メトリクス、診断ツール

## 📦 インストール

```bash
# グローバルインストール
npm install -g @himorishige/hatago

# またはプロジェクトローカル
npm install @himorishige/hatago

# またはnpxで直接実行
npx @himorishige/hatago serve
```

## 🚀 クイックスタート

### Claude Code / VS Code統合

プロジェクトルートに`.mcp.json`を作成：

```json
{
  "hatago": {
    "command": "npx",
    "args": ["-y", "@himorishige/hatago@latest", "serve", "--quiet"]
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
- [**MCP統合ガイド**](docs/mcp-integration.md) - プロジェクトへの統合方法
- [**詳細README**](server/README.md) - CLIコマンドリファレンス

### 🔧 開発者向け
- [**実装状況**](docs/implementation-status.md) - 機能の実装状況（98%完了）
- [**残存タスク**](docs/remaining-tasks.md) - 技術的課題と改善項目
- [**仕様書**](docs/spec-v0.0.1.md) - アーキテクチャ設計
- [**テストガイド**](server/docs/testing-guide.md) - テスト環境構築

### 🔒 セキュリティ
- [**セキュリティガイド**](docs/security.md) - セキュリティ機能の詳細

## 🏗️ アーキテクチャ

```
┌─────────────┐     ┌──────────────┐     ┌────────────────┐
│   AI Tools  │────▶│  Hatago Hub  │────▶│  MCP Servers   │
│ Claude Code │     │              │     │                │
│   Cursor    │     │   - Router   │     │ - Filesystem   │
│   VS Code   │     │   - Registry │     │ - GitHub       │
└─────────────┘     │   - Proxy    │     │ - Database     │
                    └──────────────┘     │ - Custom       │
                                        └────────────────┘
```

## 🛠️ 技術スタック

- **Runtime**: Node.js 20+ / Bun / Deno
- **Framework**: [Hono](https://hono.dev/) - 軽量Webフレームワーク
- **Protocol**: [MCP](https://modelcontextprotocol.io/) - Model Context Protocol
- **Language**: TypeScript (ESM)
- **Build**: tsdown / Rolldown
- **Test**: Vitest
- **Lint/Format**: Biome

## 🤝 コントリビューション

現在プライベート開発中ですが、将来的にはオープンソース化を予定しています。

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