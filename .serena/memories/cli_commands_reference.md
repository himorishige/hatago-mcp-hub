# Hatago CLI コマンドリファレンス

## 概要

Hatagoは、MCP (Model Context Protocol) サーバーを統合管理するためのCLIツールです。
Claude Codeとの互換性を持ちながら、より高度な管理機能を提供します。

## インストール

```bash
npm install -g @himorishige/hatago
# または
npx @himorishige/hatago <command>
```

## コマンド一覧

### `hatago serve`

MCP Hubサーバーを起動します。

オプション:

- `-p, --port <port>`: サーバーポート（デフォルト: 3000）
- `-c, --config <path>`: 設定ファイルパス
- `--watch`: 設定ファイルの変更を監視

### `hatago npx <subcommand>`

NPX経由でMCPサーバーを管理します。

サブコマンド:

- `add <package>`: NPX MCPサーバーを追加
  - 例: `hatago npx add @modelcontextprotocol/server-filesystem`
- `list`: 登録されたNPXサーバー一覧を表示
- `remove <id>`: NPXサーバーを削除
- `start <id>`: サーバーを起動
- `stop <id>`: サーバーを停止
- `restart <id>`: サーバーを再起動
- `status <id>`: サーバーの詳細状態を表示

### `hatago mcp <subcommand>` (Claude Code互換)

MCP設定を管理します。Claude Codeの設定形式と完全互換。

サブコマンド:

- `list`: MCP設定一覧を表示
- `add <name> <command> [args...]`: MCP設定を追加
  - 例: `hatago mcp add filesystem "npx @modelcontextprotocol/server-filesystem /tmp"`
- `remove <name>`: MCP設定を削除

### `hatago session <subcommand>`

アクティブなセッションを管理します。

サブコマンド:

- `list`: アクティブセッション一覧
- `delete <id>`: 特定のセッションを削除
- `clear`: 全セッションをクリア
- `info <id>`: セッションの詳細情報

### `hatago secret <subcommand>`

環境変数と秘密情報を管理します。

サブコマンド:

- `list`: 登録された秘密情報一覧
- `set <key> <value>`: 秘密情報を設定
- `delete <key>`: 秘密情報を削除

### `hatago policy <subcommand>`

セキュリティポリシーを管理します。

サブコマンド:

- `list`: ポリシー一覧
- `enable <policy>`: ポリシーを有効化
- `disable <policy>`: ポリシーを無効化

### `hatago doctor`

システム診断を実行し、環境の問題を検出します。

チェック項目:

- Node.jsバージョン
- 必要なパッケージ
- 設定ファイルの妥当性
- ポート使用状況

### `hatago init`

初期設定ファイルを生成します。

オプション:

- `--force`: 既存の設定を上書き
- `--template <name>`: テンプレートを指定

### `hatago status`

Hubサーバーのステータスを確認します。

### `hatago reload`

設定を再読み込みします（サーバー再起動なし）。

### `hatago drain`

グレースフルシャットダウンを実行します。

## 設定ファイル

### 場所

- `~/.hatago/config.json` (グローバル)
- `./.hatago/config.json` (プロジェクトローカル)

### 形式

```json
{
  "servers": {
    "filesystem": {
      "command": "npx",
      "args": ["@modelcontextprotocol/server-filesystem", "/tmp"]
    }
  },
  "policies": {
    "allowFileAccess": true,
    "maxConcurrentSessions": 10
  },
  "secrets": {
    "OPENAI_API_KEY": "${OPENAI_API_KEY}"
  }
}
```

## 環境変数

- `HATAGO_PORT`: サーバーポート
- `HATAGO_CONFIG`: 設定ファイルパス
- `HATAGO_LOG_LEVEL`: ログレベル (debug|info|warn|error)

## Claude Code互換性

`hatago mcp`コマンドは、Claude Codeの設定ファイル形式と完全互換です。
既存のClaude Code設定をそのまま移行できます。
