# Claude Code接続設定ガイド

## 問題の原因

Claude Codeからの接続が失敗する主な原因：

1. **PATH問題**: GUI環境ではnodeやnpxへのPATHが通っていない
2. **npx初回実行**: npxが初回ダウンロードのメッセージを出力してプロトコルを壊す
3. **子サーバー起動の遅延**: 初期化時に子サーバーの起動を待ってタイムアウト

## 解決方法

### ステップ1: 最小構成でテスト

まず、子サーバーなしの最小構成で接続を確認します。

`.mcp.json`に以下を追加：

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

`claude-empty.config.json`の内容：

```json
{
  "version": 1,
  "mcpServers": {}
}
```

これでClaude Codeを再起動して接続できることを確認してください。

### ステップ2: filesystem serverの追加

接続が確認できたら、filesystem serverを追加します。

まず、グローバルインストール（既に完了済み）：

```bash
npm install -g @modelcontextprotocol/server-filesystem
```

`.mcp.json`を更新：

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
        "LOG_LEVEL": "error"
      }
    }
  }
}
```

`claude-absolute.config.json`の内容：

```json
{
  "version": 1,
  "mcpServers": {
    "filesystem": {
      "type": "local",
      "command": "/Users/morishige/.local/share/mise/installs/node/22.18.0/bin/node",
      "args": [
        "/Users/morishige/.local/share/mise/installs/node/22.18.0/lib/node_modules/@modelcontextprotocol/server-filesystem/dist/index.js",
        "/tmp"
      ],
      "disabled": false,
      "activationPolicy": "onDemand",
      "idlePolicy": {
        "maxIdleMinutes": 5,
        "checkIntervalMinutes": 1
      }
    }
  }
}
```

## 重要なポイント

1. **絶対パスを使用**: nodeもcli.jsも絶対パスで指定
2. **npxを避ける**: 直接nodeで実行ファイルを起動
3. **段階的にテスト**: まず空の設定で接続確認、その後サーバーを追加
4. **autoStartAlwaysは無効**: 初期化をブロックしないように

## トラブルシューティング

### VS Codeをターミナルから起動

環境変数を正しく引き継ぐには：

```bash
code .
```

### ログレベルを上げる

問題調査時は`LOG_LEVEL`を`"debug"`に：

```json
"env": {
  "LOG_LEVEL": "debug"
}
```

### 手動テスト

設定が正しいか確認：

```bash
echo -e 'Content-Length: 213\r\n\r\n{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{"roots":{"listChanged":true},"sampling":{},"experimental":{}},"clientInfo":{"name":"test","version":"1.0.0"}}}' | \
/Users/morishige/.local/share/mise/installs/node/22.18.0/bin/node \
/Users/morishige/ghq/github.com/himorishige/hatago-hub/packages/server/dist/cli.js \
--stdio --config /Users/morishige/ghq/github.com/himorishige/hatago-hub/claude-empty.config.json
```

## 利用可能なツール

接続成功後、以下のツールが使えるようになります：

### 管理ツール（常に利用可能）

- `_hatago_management_hatago_get_config`: 設定の取得
- `_hatago_management_hatago_list_servers`: サーバー一覧
- `_hatago_management_hatago_activate_server`: サーバーの手動起動
- `_hatago_management_hatago_deactivate_server`: サーバーの手動停止
- `_hatago_management_hatago_get_server_info`: サーバー情報の取得
- `_hatago_management_hatago_get_server_states`: サーバー状態の取得
- `_hatago_management_hatago_reset_server`: サーバーのリセット

### filesystem server（設定後）

- `filesystem_read_file`: ファイル読み込み
- `filesystem_write_file`: ファイル書き込み
- `filesystem_list_directory`: ディレクトリ一覧
- その他多数のファイル操作ツール

## 今後の拡張

他のMCPサーバーも同じ方法で追加できます：

1. グローバルインストール or ローカルパス指定
2. 絶対パスで設定
3. onDemandポリシーで必要時のみ起動
