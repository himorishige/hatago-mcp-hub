# allowNet 設定ガイド

## 概要

Hatago Hubの`allowNet`設定は、リモートMCPサーバーが接続可能なネットワーク宛先を制御します。これは不正なネットワークアクセスを防ぐためのセキュリティ機能です。

## 重要な注意事項

⚠️ **`allowNet`フィールドには完全なURLではなく、ホスト名を指定してください。**

## 設定フォーマット

```json
{
  "security": {
    "allowNet": ["ホスト名1", "ホスト名2", "..."]
  }
}
```

## 設定例

### 特定のホストを許可

```json
{
  "security": {
    "allowNet": [
      "api.github.com",
      "mcp.deepwiki.com",
      "localhost",
      "192.168.1.100"
    ]
  }
}
```

### すべてのホストを許可（本番環境では非推奨）

```json
{
  "security": {
    "allowNet": ["*"]
  }
}
```

### 一般的なMCPサーバーのホスト名

人気のあるMCPサーバーで使用される一般的なホスト名：

```json
{
  "security": {
    "allowNet": [
      "api.github.com",           // GitHub MCP Server
      "api.openai.com",           // OpenAI API
      "api.anthropic.com",        // Anthropic API
      "mcp.deepwiki.com",         // DeepWiki MCP
      "api.slack.com",            // Slack MCP Server
      "www.googleapis.com",       // Google Drive MCP
      "graph.microsoft.com",      // Microsoft Graph MCP
      "localhost"                 // ローカルテスト用
    ]
  }
}
```

## 動作の仕組み

1. リモートMCPサーバーがURL（例：`https://api.github.com/mcp`）で設定されている場合
2. Hatagoはホスト名を抽出：`api.github.com`
3. このホスト名が`allowNet`リストに含まれているか確認
4. 見つからず、かつ`*`でない場合、接続はブロックされます

## 検証例

| 設定のURL | 必要なallowNetエントリ | 有効？ |
|----------|----------------------|--------|
| `https://api.github.com/mcp` | `api.github.com` | ✅ |
| `https://api.github.com/mcp` | `github.com` | ❌ |
| `http://localhost:3000/mcp` | `localhost` | ✅ |
| `https://192.168.1.100:8080/mcp` | `192.168.1.100` | ✅ |
| 任意のURL | `*` | ✅ |

## セキュリティのベストプラクティス

1. **具体的に指定**: 必要なホストのみを正確に許可
2. **ワイルドカードを避ける**: 本番環境では`*`を使用しない
3. **HTTPSを使用**: リモートサーバーには常にHTTPS URLを優先
4. **定期的なレビュー**: 使用していないホストを定期的に確認・削除
5. **環境別設定**: 開発/ステージング/本番で異なるallowNetリストを使用

## トラブルシューティング

### エラー: "Invalid host"

URLをホスト名の代わりに設定している場合に発生：

❌ **誤り:**
```json
{
  "security": {
    "allowNet": ["https://api.github.com"]
  }
}
```

✅ **正しい:**
```json
{
  "security": {
    "allowNet": ["api.github.com"]
  }
}
```

### エラー: "Host not allowed"

ホスト名がallowNetリストに含まれていません。確認事項：
1. エラーメッセージに表示される正確なホスト名を確認
2. allowNet設定に追加
3. Hatagoサーバーを再起動

## リモートサーバーとの統合

リモートサーバーを設定する際は、ホスト名が許可されていることを確認：

```json
{
  "security": {
    "allowNet": [
      "mcp.example.com",
      "api.service.com"
    ]
  },
  "servers": [
    {
      "id": "example",
      "type": "remote",
      "url": "https://mcp.example.com/sse",
      "transport": "http"
    },
    {
      "id": "api",
      "type": "remote", 
      "url": "https://api.service.com/mcp",
      "transport": "http"
    }
  ]
}
```

## デフォルトの動作

- `allowNet`が指定されていない場合、リモート接続は許可されません
- 空の配列`[]`はホストが許可されないことを意味します
- `["*"]`を含む配列はすべてのホストを許可します（注意して使用）

## 環境変数

動的な設定のために環境変数も使用できます：

```json
{
  "security": {
    "allowNet": ["${ALLOWED_HOST_1}", "${ALLOWED_HOST_2}"]
  }
}
```

環境変数の設定：
```bash
export ALLOWED_HOST_1=api.github.com
export ALLOWED_HOST_2=mcp.deepwiki.com
```

## CLIでの設定

CLIコマンドでリモートサーバーを追加する場合、自動的にホスト名が抽出されますが、allowNetへの手動追加が必要です：

```bash
# リモートサーバーを追加
hatago mcp add github --transport http -- https://api.github.com/mcp

# 設定ファイルでallowNetを更新
# .hatago/config.jsonc
{
  "security": {
    "allowNet": ["api.github.com"]
  }
}
```

## 関連ドキュメント

- [セキュリティガイド](../../docs/security.md) - Hatagoのセキュリティ機能の詳細
- [MCP統合ガイド](../../docs/mcp-integration.md) - MCPサーバーの統合方法
- [実装状況](../../docs/implementation-status.md) - セキュリティ機能の実装状況

## よくある質問

### Q: ローカル開発でallowNetを無効にできますか？

A: 開発環境では`["*"]`を使用できますが、本番環境では必ず具体的なホスト名を指定してください。

### Q: サブドメインのワイルドカードは使用できますか？

A: 現在はサポートされていません。各サブドメインを個別に指定する必要があります。

### Q: IPアドレスの範囲指定は可能ですか？

A: 現在はサポートされていません。個別のIPアドレスを指定してください。

……まあ、セキュリティの設定も魔法の防御結界みたいなものだね。