# Hatago MCP Integration Guide

Hatagoを既存プロジェクトでMCPサーバーとして使用する方法について説明します。

## 特徴

- **プロジェクト非侵襲型**: プロジェクトディレクトリを汚染しません
- **設定不要**: デフォルト設定で即座に動作
- **STDIO対応**: Claude CodeやVS Codeから直接利用可能

## クイックスタート

### Claude Code (.mcp.json)

プロジェクトルートに`.mcp.json`を作成：

```json
{
  "hatago": {
    "command": "npx",
    "args": [
      "-y",
      "@himorishige/hatago@latest",
      "serve"
    ]
  }
}
```

### VS Code (.vscode/mcp.json)

`.vscode/mcp.json`を作成：

```json
{
  "servers": {
    "hatago": {
      "type": "stdio",
      "command": "npx",
      "args": [
        "-y",
        "@himorishige/hatago@latest",
        "serve",
        "--quiet"
      ]
    }
  }
}
```

## 設定オプション

### 基本オプション

| オプション | 説明 | デフォルト |
|-----------|------|-----------|
| `--quiet` | 不要なログ出力を抑制 | false |
| `--config <path>` | 設定ファイルのパス | 自動検出 |
| `--http` | HTTPモードで起動 | STDIOモード |

### リモートMCPサーバーの追加

実行時にリモートMCPサーバーを追加する場合：

```json
{
  "hatago": {
    "command": "npx",
    "args": [
      "-y",
      "@himorishige/hatago@latest",
      "serve",
      "--quiet"
    ],
    "env": {
      "HATAGO_REMOTE_SERVERS": "deepwiki=https://mcp.deepwiki.com/sse"
    }
  }
}
```

## 設定ファイル（オプション）

Hatagoは設定ファイルなしでも動作しますが、カスタマイズが必要な場合は以下の優先順位で設定ファイルを検出します：

1. `.hatago.json` - プロジェクトルート
2. `.hatago.jsonc` - プロジェクトルート（コメント付き）
3. `.hatago/config.json` - プロジェクトローカル
4. `.hatago/config.jsonc` - プロジェクトローカル
5. `~/.hatago/config.jsonc` - ユーザーホーム

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

## Windows環境での使用

Windows（非WSL）では、`cmd /c`ラッパーが必要です：

```json
{
  "hatago": {
    "command": "cmd",
    "args": [
      "/c",
      "npx",
      "-y",
      "@himorishige/hatago@latest",
      "serve"
    ]
  }
}
```

## トラブルシューティング

### ログの確認

quietモードを解除してログを確認：
```bash
npx @himorishige/hatago serve
```

### 設定の検証

現在の設定を確認：
```bash
npx @himorishige/hatago list
```

### デバッグモード

詳細なデバッグ情報を出力：
```bash
DEBUG=* npx @himorishige/hatago serve
```

## 利用例

### 1. DeepWiki MCPを統合

```json
{
  "hatago": {
    "command": "npx",
    "args": ["-y", "@himorishige/hatago@latest", "serve"],
    "env": {
      "HATAGO_CONFIG": "{ \"servers\": [{ \"id\": \"deepwiki\", \"type\": \"remote\", \"url\": \"https://mcp.deepwiki.com/sse\", \"transport\": \"sse\" }] }"
    }
  }
}
```

### 2. 複数のMCPサーバーを統合

`.hatago.json`を作成：
```json
{
  "servers": [
    {
      "id": "filesystem",
      "type": "npx",
      "package": "@modelcontextprotocol/server-filesystem",
      "args": ["/path/to/workspace"]
    },
    {
      "id": "github",
      "type": "remote",
      "url": "https://api.githubcopilot.com/mcp/"
    }
  ]
}
```

## セキュリティ考慮事項

- Hatagoはデフォルトでプロジェクトディレクトリに書き込みを行いません
- 一時ファイルはOSのtmpディレクトリを使用
- 認証情報は環境変数経由で渡すことを推奨

## 関連リンク

- [Hatago GitHub Repository](https://github.com/himorishige/hatago-hub)
- [MCP Specification](https://modelcontextprotocol.io)
- [Claude Code Documentation](https://docs.anthropic.com/claude-code)