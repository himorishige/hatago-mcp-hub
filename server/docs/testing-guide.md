# Hatago MCP Hub テストガイド

## 概要

このドキュメントでは、Hatago MCP Hub のテスト環境構築方法と、実際のMCPサーバーとの接続テスト手順について説明します。

## テスト環境の構築

### 1. モックMCPサーバー

開発・テスト用のモックMCPサーバーが `test/fixtures/mock-mcp-server.ts` に用意されています。

#### 起動方法

```bash
# モックサーバーをスタンドアロンで起動
pnpm tsx test/fixtures/mock-mcp-server.ts
```

モックサーバーは以下の機能を提供します：

- **エンドポイント**: `http://localhost:4001/mcp`
- **セッション管理**: MCP標準のセッション管理をサポート
- **モックツール**:
  - `test_echo`: 入力をエコーバック
  - `test_math`: 簡単な計算を実行
- **モックリソース**: テスト用の設定ファイルとデータ
- **モックプロンプト**: テスト用のプロンプトテンプレート

### 2. ローカルテスト環境でのHub起動

```bash
# 開発モードで起動（ホットリロード付き）
pnpm dev

# または本番モードで起動
pnpm build && pnpm start
```

### 3. リモートサーバー接続のテスト

#### 設定例 (.hatago/config.jsonc)

```jsonc
{
  "servers": [
    {
      "id": "local-test",
      "type": "remote",
      "url": "http://localhost:4001/mcp",
      "transport": "http",
      "start": "lazy"
    }
  ]
}
```

#### CLIでの追加

```bash
# ローカルモックサーバーを追加
hatago remote add http://localhost:4001/mcp --id local-test

# 接続確認
hatago remote test local-test
```

## 実際のMCPサーバーとの接続

### 公開MCPサーバーの例

現在、以下のような形式でMCPサーバーが提供される予定です：

1. **NPXパッケージ経由**
   ```bash
   # NPXサーバーとして追加
   hatago npx add @modelcontextprotocol/server-filesystem --id fs
   ```

2. **ローカルHTTPサーバー**
   ```jsonc
   {
     "id": "local-mcp",
     "type": "remote",
     "url": "http://127.0.0.1:3845/mcp",
     "transport": "http"
   }
   ```

3. **SSEサーバー（レガシー）**
   ```jsonc
   {
     "id": "sse-server",
     "type": "remote",
     "url": "http://127.0.0.1:3845/sse",
     "transport": "sse"  // SSEは非推奨
   }
   ```

## テストの実行

### ユニットテスト

```bash
# 全テストを実行
pnpm test

# カバレッジ付き
pnpm coverage

# 特定のテストのみ
pnpm test remote-server
```

### E2Eテスト

```bash
# E2Eテストを実行
pnpm test:e2e

# 特定のE2Eテスト
pnpm test test/e2e/remote-server.test.ts
```

## トラブルシューティング

### 接続エラー

1. **ECONNREFUSED エラー**
   - 対象サーバーが起動していることを確認
   - ポート番号が正しいことを確認
   - ファイアウォール設定を確認

2. **セッションエラー**
   - `mcp-session-id` ヘッダーが正しく送信されているか確認
   - サーバーが初期化されているか確認

3. **タイムアウトエラー**
   - `connectTimeoutMs` 設定を増やす
   - ネットワーク接続を確認

### デバッグモード

詳細なログを出力するには：

```bash
# 環境変数でデバッグモードを有効化
DEBUG=hatago:* pnpm dev
```

## 推奨テストフロー

1. **開発時**
   - モックサーバーを使用してローカルテスト
   - ユニットテストで個別機能を検証

2. **統合テスト**
   - 実際のNPXサーバーとの接続テスト
   - 複数サーバーの同時接続テスト

3. **本番前**
   - E2Eテストの完全実行
   - セキュリティ設定の確認（allowNet等）

## セキュリティ考慮事項

### allowNet設定

リモートサーバー接続時は、必ず `allowNet` でホストを制限：

```jsonc
{
  "security": {
    "allowNet": [
      "localhost",      // ローカルテスト用
      "api.example.com" // 本番サーバー
    ]
  }
}
```

### 認証設定

```jsonc
{
  "servers": [
    {
      "id": "secure-server",
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "auth": {
        "type": "bearer",
        "token": "${MCP_API_TOKEN}" // 環境変数から取得
      }
    }
  ]
}
```

## 参考リンク

- [MCP Specification](https://spec.modelcontextprotocol.io/)
- [Hatago Hub README](../README.md)
- [Configuration Guide](./allownet-configuration.md)