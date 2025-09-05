# Hatago Local Development Template

ローカル開発に最適化されたHatagoセットアップです。ファイルシステム、Git、検索機能を含みます。

## 🚀 30秒クイックスタート

```bash
# 1. 環境変数の設定（オプション）
cp .env.hatago.example .env
# 必要に応じて.envを編集

# 2. Hatagoサーバーの起動（ホットリロード付き）
hatago serve --stdio --watch

# 3. 動作確認
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | hatago serve --stdio
```

## 📦 含まれるMCPサーバー

| サーバー       | 説明                                      | タグ                 |
| -------------- | ----------------------------------------- | -------------------- |
| **filesystem** | ローカルファイルの読み書き                | local, filesystem    |
| **git**        | Gitリポジトリ操作（diff, commit, push等） | local, git           |
| **search**     | コードベース内の高速検索                  | local, search        |
| **deepwiki**   | GitHubドキュメント検索                    | cloud, documentation |

## 🔧 カスタマイズ例

### プロジェクトパスの変更

```json
{
  "mcpServers": {
    "filesystem": {
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/your/project"]
    }
  }
}
```

### 追加のMCPサーバー

```json
{
  "mcpServers": {
    "database": {
      "command": "mcp-server-postgres",
      "env": {
        "DATABASE_URL": "${DATABASE_URL}"
      },
      "tags": ["database", "local"]
    }
  }
}
```

## 🏷️ タグベースのフィルタリング

開発と本番で異なるサーバーセットを使用：

```bash
# 開発環境のサーバーのみ起動
hatago serve --tags local,development

# クラウドサービスのみ起動
hatago serve --tags cloud
```

## 📝 VS Code / Cursor 統合

`.mcp.json`に以下を追加：

```json
{
  "mcpServers": {
    "hatago-dev": {
      "command": "npx",
      "args": ["@himorishige/hatago-mcp-hub", "serve", "--stdio", "--watch"],
      "env": {
        "HATAGO_CONFIG": "./hatago.config.json"
      }
    }
  }
}
```

## 🔍 トラブルシューティング

### ファイルシステムアクセスエラー

```bash
# 権限の確認
ls -la {{projectPath}}

# 詳細ログの有効化
hatago serve --verbose
```

### Git操作が動作しない

```bash
# Gitリポジトリの初期化
git init

# Gitの設定確認
git config --list
```

## 📚 次のステップ

- [AI支援テンプレート](../ai-assistant/README.md) - GitHub連携とAI検索を追加
- [フルスタックテンプレート](../full-stack/README.md) - DB、認証、監視を含む完全セット
- [Hatago公式ドキュメント](https://github.com/himorishige/hatago-mcp-hub)
