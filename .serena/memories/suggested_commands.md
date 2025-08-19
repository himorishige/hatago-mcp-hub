# 開発コマンド一覧

## 基本コマンド（appディレクトリで実行）

### 開発・ビルド・実行
```bash
# 開発サーバー起動（ファイル監視モード）
pnpm dev

# ビルド（dist/に出力）
pnpm build  

# 本番サーバー起動
pnpm start

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