# Hatago Workers Simple Example

最小構成でCloudflare Workers上でHatago MCP Hubを動作させる例です。

## 🎯 特徴

### ✅ 含まれる機能

- **シンプルな設定**: TypeScriptファイル（`hatago.config.ts`）で型安全な設定
- **基本的なMCP機能**: tools、resources、promptsの標準MCP操作
- **リモートMCPサーバー**: HTTP/SSEベースのリモートMCPサーバーとの接続
- **ステートレス設計**: リクエストごとに独立した処理

### ❌ 含まれない機能

- **Progress通知**: 長時間実行タスクの進捗通知なし
- **セッション永続化**: KV/Durable Objectsを使用しない
- **ローカルプロセス**: Workers環境では実行不可

## 📋 前提条件

- Node.js 18+
- pnpm または npm
- Cloudflare アカウント（デプロイ時）

## 🚀 セットアップ

### 1. 依存関係のインストール

```bash
cd examples/workers-simple-example
npm install
```

### 2. ローカル開発

```bash
npm run dev
```

ブラウザで http://localhost:8787 にアクセスして動作確認できます。

### 3. デプロイ

```bash
npm run deploy
```

初回デプロイ時はCloudflareアカウントへのログインが必要です。

## ⚙️ 設定

`src/hatago.config.ts`を編集してMCPサーバーを追加・変更できます：

```typescript
export const hatagoConfig = {
  mcpServers: {
    // 新しいサーバーを追加
    myserver: {
      type: 'remote' as const,
      url: 'https://example.com/mcp',
      transport: 'streamable-http' as const
    }
  }
};
```

## 🔌 エンドポイント

| エンドポイント | メソッド | 説明                        |
| -------------- | -------- | --------------------------- |
| `/`            | GET      | API情報とサーバー一覧       |
| `/health`      | GET      | ヘルスチェック              |
| `/mcp`         | POST     | MCPプロトコルエンドポイント |

## 📝 使用例

### Claude DesktopやCursorから接続

1. デプロイ後のWorker URLを確認
2. クライアントの設定に以下を追加：

```json
{
  "mcpServers": {
    "hatago-worker": {
      "url": "https://hatago-simple-worker.your-subdomain.workers.dev/mcp",
      "transport": "http"
    }
  }
}
```

### cURLでテスト

```bash
# ヘルスチェック
curl https://hatago-simple-worker.your-subdomain.workers.dev/health

# ツール一覧取得
curl -X POST https://hatago-simple-worker.your-subdomain.workers.dev/mcp \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "method": "tools/list",
    "id": 1
  }'
```

## 🏗️ アーキテクチャ

```
Request → Cloudflare Worker
           ├── Hub作成（リクエストごと）
           ├── リモートMCPサーバーへ接続
           └── レスポンス返却
```

- **ステートレス**: 各リクエストは独立して処理
- **サーバーレス**: Cloudflare Workersのインフラを活用
- **グローバル**: Cloudflareのエッジネットワークで世界中から低遅延アクセス

## 🔄 高度な機能が必要な場合

以下の機能が必要な場合は、`examples/workers-example`を参照してください：

- Progress通知のサポート
- セッション状態の永続化（KV/Durable Objects）
- 環境変数による動的設定
- SSEによるリアルタイム通知

## 🐛 トラブルシューティング

### "Failed to add server"エラー

- リモートMCPサーバーのURLが正しいか確認
- サーバーがCORSを許可しているか確認

### TypeScriptエラー

```bash
npm run type-check
```

### Wranglerのログ確認

```bash
wrangler tail
```

## 📚 参考資料

- [Hatago MCP Hub Documentation](../../README.md)
- [Cloudflare Workers Documentation](https://developers.cloudflare.com/workers/)
- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Hono Framework](https://hono.dev/)
