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
# MCP Hubサーバー起動
hatago serve

# サーバーステータス確認
hatago status

# 設定リロード
hatago reload
```

### NPX MCPサーバー管理
```bash
# NPXサーバー追加
hatago npx add <package>

# NPXサーバー一覧
hatago npx list

# NPXサーバー削除
hatago npx remove <id>

# サーバー起動/停止/再起動
hatago npx start <id>
hatago npx stop <id>
hatago npx restart <id>

# サーバー詳細状態
hatago npx status <id>
```

### MCP設定管理（Claude Code互換）
```bash
# MCP設定一覧（Claude Codeと同じ形式）
hatago mcp list

# MCP設定追加（Claude Code互換）
hatago mcp add <name> <command>

# MCP設定削除（Claude Code互換）
hatago mcp remove <name>

# 注: これらのコマンドはClaude Codeの設定ファイル形式と互換性があり、
# 既存のClaude Code設定をそのまま利用できます
```

### セッション管理
```bash
# セッション一覧
hatago session list

# セッション削除
hatago session delete <id>

# 全セッション削除
hatago session clear
```

### その他の管理コマンド
```bash
# 秘密情報管理
hatago secret list
hatago secret set <key> <value>
hatago secret delete <key>

# ポリシー管理
hatago policy list
hatago policy enable <policy>
hatago policy disable <policy>

# システム診断
hatago doctor

# 初期設定生成
hatago init
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