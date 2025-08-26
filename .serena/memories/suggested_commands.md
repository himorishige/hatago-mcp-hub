# 開発コマンド一覧

## 基本コマンド（server/ディレクトリで実行）

### 開発・ビルド・実行

```bash
# 開発サーバー起動（ファイル監視モード）
pnpm dev

# ビルド（dist/に出力）
pnpm build

# 本番サーバー起動
pnpm start

# CLI開発実行
pnpm cli

# サーバーへのアクセス
open http://localhost:3000
```

### コード品質管理

```bash
# フォーマット（自動修正）
pnpm format

# リント（自動修正）
pnpm lint

# フォーマット・リント・型チェックを一括実行（自動修正）
pnpm check
```

### テスト

```bash
# テスト実行
pnpm test

# カバレッジ付きテスト
pnpm coverage
```

## Hatago CLIコマンド

### サーバー管理

```bash
# MCP Hubサーバー起動（STDIOモード）
pnpm cli serve

# HTTPモードで起動
pnpm cli serve --mode http --port 3000

# サーバーステータス確認
pnpm cli status

# 設定リロード
pnpm cli reload
```

### MCPサーバー管理（Claude Code互換）

```bash
# ローカルSTDIOサーバー（NPX） - Claude Code形式
pnpm cli mcp add filesystem -- npx -y @modelcontextprotocol/server-filesystem /tmp

# ローカルNode.jsサーバー - Claude Code形式
pnpm cli mcp add myserver -- node ./server.js arg1 arg2

# リモートSSEサーバー
pnpm cli mcp add --transport sse linear https://mcp.linear.app/sse

# リモートHTTPサーバー（認証付き）
pnpm cli mcp add --transport http --header "Authorization:Bearer TOKEN" api https://api.example.com/mcp

# 環境変数付き
pnpm cli mcp add --env API_KEY=secret db -- node ./db-server.js

# サーバー一覧表示
pnpm cli mcp list

# サーバー削除
pnpm cli mcp remove filesystem

# 後方互換形式（引用符で囲む）
pnpm cli mcp add old-format "npx @modelcontextprotocol/server-everything"
```

### NPXサーバー管理（個別コマンド）

```bash
# NPXサーバー追加
pnpm cli npx add @modelcontextprotocol/server-filesystem

# NPXサーバー一覧
pnpm cli npx list

# NPXサーバー削除
pnpm cli npx remove <id>

# サーバー起動/停止/再起動
pnpm cli npx start <id>
pnpm cli npx stop <id>
pnpm cli npx restart <id>

# サーバー詳細状態
pnpm cli npx status <id>
```

### リモートサーバー管理（個別コマンド）

```bash
# リモートサーバー追加
pnpm cli remote add https://mcp.example.com/sse --id example

# リモートサーバー一覧
pnpm cli remote list

# リモートサーバー削除
pnpm cli remote remove example
```

### セッション管理

```bash
# セッション一覧
pnpm cli session list

# セッション削除
pnpm cli session delete <id>

# 全セッション削除
pnpm cli session clear
```

### その他の管理コマンド

```bash
# 秘密情報管理
pnpm cli secret list
pnpm cli secret set <key> <value>
pnpm cli secret delete <key>

# ポリシー管理
pnpm cli policy list
pnpm cli policy enable <policy>
pnpm cli policy disable <policy>

# システム診断
pnpm cli doctor

# 初期設定生成
pnpm cli init
```

## パッケージ管理

```bash
# 依存関係インストール
pnpm install

# パッケージ追加
pnpm add <package>
pnpm add -D <dev-package>
```

## Git関連

```bash
# ステータス確認
git status

# 差分確認
git diff

# ログ確認
git log --oneline -10
```

## タスク完了時の推奨コマンド

1. `pnpm format` - コードフォーマット
2. `pnpm lint` - リントチェック
3. `pnpm test` - テスト実行（テストが存在する場合）
4. `pnpm build` - ビルドエラーチェック

## 最終更新日

2025-08-23
