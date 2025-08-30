# MCP設定例（npx実行用）

## Claude Code設定 (.mcp.json)

### オプション1: @hatago/cli パッケージを使用

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": [
        "hatago",
        "serve",
        "--stdio",
        "--config",
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-with-everything.config.json"
      ]
    }
  }
}
```

### オプション2: @hatago/server パッケージを直接使用

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": [
        "hatago-server",
        "--stdio",
        "--watch",
        "--config",
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-with-everything.config.json"
      ]
    }
  }
}
```

### オプション3: ローカルパッケージを直接指定（npm linkなし）

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": [
        "-p",
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/packages/cli",
        "hatago",
        "serve",
        "--stdio",
        "--config",
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-with-everything.config.json"
      ]
    }
  }
}
```

## 実行確認方法

### 1. コマンドラインでテスト

```bash
# CLIパッケージ経由
npx hatago serve --stdio --config ./claude-with-everything.config.json

# Serverパッケージ直接
npx hatago-server --stdio --watch --config ./claude-with-everything.config.json
```

### 2. バージョン確認

```bash
# CLIバージョン
npx hatago --version

# Serverバージョン
npx hatago-server --version
```

## トラブルシューティング

### パッケージが見つからない場合

1. パッケージをビルド:
```bash
pnpm -r build
```

2. npm linkを再実行:
```bash
cd packages/cli && npm link --force
cd ../server && npm link --force
```

### 実行権限エラーの場合

```bash
chmod +x packages/cli/dist/index.js
chmod +x packages/server/dist/cli.js
```

### 設定ファイルパスについて

- 絶対パスを使用することを推奨
- 相対パスの場合は、実行ディレクトリからの相対パスになる

## 推奨設定

開発環境では`--watch`オプションを使用することで、設定ファイルの変更を自動的に反映できます：

```json
{
  "mcpServers": {
    "hatago": {
      "command": "npx",
      "args": [
        "hatago-server",
        "--stdio",
        "--watch",
        "--config",
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-with-everything.config.json"
      ]
    }
  }
}
```