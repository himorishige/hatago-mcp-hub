# Hatago Hub Profiles

プロファイル機能を使用することで、プロジェクトやAIツールごとに異なるMCPサーバー構成を使い分けることができます。

## 使い方

### プロファイルを指定して起動

```bash
# フロントエンド開発用プロファイル
npx @himorishige/hatago serve --profile frontend

# バックエンド開発用プロファイル
npx @himorishige/hatago serve --profile backend

# 調査・ドキュメント作成用プロファイル
npx @himorishige/hatago serve --profile research
```

### AIツール側の設定

#### Claude Codeの場合 (.claude_mcp_settings.json)

```json
{
  "mcpServers": {
    "hatago-frontend": {
      "command": "npx",
      "args": ["@himorishige/hatago", "serve", "--profile", "frontend"]
    },
    "hatago-backend": {
      "command": "npx",
      "args": ["@himorishige/hatago", "serve", "--profile", "backend"]
    }
  }
}
```

#### Cursorの場合

```json
{
  "mcpServers": {
    "hatago-research": {
      "command": "npx",
      "args": ["@himorishige/hatago", "serve", "--profile", "research"]
    }
  }
}
```

## プロファイル一覧

### frontend.jsonc

フロントエンド開発向けのプロファイル

- ファイルシステム（読み取り専用）
- Brave Search（ドキュメント検索）
- ポート: 3001

### backend.jsonc

バックエンド開発向けのプロファイル

- ファイルシステム（読み書き可能）
- PostgreSQL
- GitHub API
- ポート: 3002

### research.jsonc

調査・ドキュメント作成向けのプロファイル

- ファイルシステム（Documents配下）
- Brave Search
- Google Drive
- DeepWiki
- ポート: 3003

## カスタムプロファイルの作成

新しいプロファイルを作成するには、`.hatago/profiles/`ディレクトリに`{profile-name}.jsonc`ファイルを作成してください。

```jsonc
{
  "version": 1,
  "logLevel": "info",
  "servers": [
    // MCPサーバーの設定
  ],
}
```

## メリット

- **プロジェクト分離**: プロジェクトごとに必要なツールだけを有効化
- **セキュリティ向上**: 各プロファイルで許可するツールを制限
- **リソース最適化**: 使用しないサーバーを起動しない
- **設定の再利用**: プロファイルをチーム間で共有可能
