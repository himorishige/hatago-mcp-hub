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

### リモートサーバー管理

```bash
# リモートサーバーを追加
hatago remote add https://mcp.example.com/sse --id example

# リモートサーバー一覧
hatago remote list

# リモートサーバーを削除
hatago remote remove example
```

### NPXサーバー管理

```bash
# NPXサーバーを追加
hatago npx add @modelcontextprotocol/server-filesystem

# NPXサーバー一覧
hatago npx list

# NPXサーバーを起動/停止
hatago npx start filesystem
hatago npx stop filesystem
```

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

### 最小設定例

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

## 📄 License

MIT

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 🔗 Links

- [GitHub Repository](https://github.com/himorishige/hatago-hub)
- [MCP Specification](https://modelcontextprotocol.io)
- [npm Package](https://www.npmjs.com/package/@himorishige/hatago)