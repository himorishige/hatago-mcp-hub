# Claude Code設定手順

## 1. 最小構成でのテスト（子サーバーなし）

以下の内容を`.mcp.json`に追加してください：

```json
{
  "mcpServers": {
    "hatago-hub": {
      "command": "/Users/morishige/.local/share/mise/installs/node/22.18.0/bin/node",
      "args": [
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/packages/server/dist/cli.js",
        "--stdio",
        "--config",
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-empty.config.json"
      ],
      "env": {
        "PATH": "/Users/morishige/.local/share/mise/installs/node/22.18.0/bin:/usr/local/bin:/usr/bin:/bin",
        "LOG_LEVEL": "error"
      }
    }
  }
}
```

この設定で接続できることを確認してください。

## 2. filesystem serverのインストール（接続確認後）

```bash
npm install -g @modelcontextprotocol/server-filesystem
```

インストール先を確認：

```bash
npm list -g @modelcontextprotocol/server-filesystem
```

## 3. filesystem server付き設定

インストール完了後、以下の設定ファイルを作成：

`claude-absolute.config.json`:

```json
{
  "version": 1,
  "mcpServers": {
    "filesystem": {
      "type": "local",
      "command": "/Users/morishige/.local/share/mise/installs/node/22.18.0/bin/mcp-server-filesystem",
      "args": ["/tmp"],
      "disabled": false,
      "activationPolicy": "onDemand"
    }
  }
}
```

注意: `mcp-server-filesystem`の実際のパスは、インストール後に確認してください。

## 4. 完全版の.mcp.json設定

```json
{
  "mcpServers": {
    "hatago-hub": {
      "command": "/Users/morishige/.local/share/mise/installs/node/22.18.0/bin/node",
      "args": [
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/packages/server/dist/cli.js",
        "--stdio",
        "--config",
        "/Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-absolute.config.json"
      ],
      "env": {
        "PATH": "/Users/morishige/.local/share/mise/installs/node/22.18.0/bin:/usr/local/bin:/usr/bin:/bin",
        "LOG_LEVEL": "error",
        "NO_COLOR": "1",
        "NPM_CONFIG_UPDATE_NOTIFIER": "false",
        "NPM_CONFIG_FUND": "false"
      }
    }
  }
}
```

## トラブルシューティング

### 接続が失敗する場合

1. **手動テスト**:

```bash
echo -e 'Content-Length: 213\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":true},"sampling":{},"experimental":{}},"clientInfo":{"name":"test","version":"1.0.0"}}}' | /Users/morishige/.local/share/mise/installs/node/22.18.0/bin/node /Users/morishige/ghq/github.com/himorishige/hatago-hub/packages/server/dist/cli.js --stdio --config /Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-empty.config.json
```

2. **ログレベルを上げて確認**:
   - `LOG_LEVEL`を`"debug"`に変更
   - Claude Codeのコンソールでエラーを確認

3. **VS Codeをターミナルから起動**:

```bash
code .
```

これで環境変数が正しく引き継がれます。

## 段階的な追加

1. まず`claude-empty.config.json`で接続確認
2. filesystem serverをグローバルインストール
3. `claude-absolute.config.json`で1つずつサーバーを追加
4. 各段階で接続テストを実施
