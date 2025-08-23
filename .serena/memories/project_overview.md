# Hatago MCP Hub プロジェクト概要

## プロジェクトの目的
Hatago MCP Hub は Hono と hono/mcp を薄くラップした高速・軽量・シンプルな MCP Hub サーバー。
複数の MCP サーバーを統合管理し、ツール名の衝突回避やセッション管理を行う。

## 技術スタック
- **言語**: TypeScript
- **実行環境**: Node.js 20+
- **Webフレームワーク**: Hono
- **ビルドツール**: tsdown (ESM output)
- **パッケージマネージャ**: pnpm
- **テストフレームワーク**: Vitest  
- **リンター/フォーマッター**: Biome
- **CLI**: Commander + Zod

## プロジェクト構造
```
/
├── server/              # メインアプリケーション
│   ├── src/
│   │   ├── index.ts     # サーバーエントリーポイント
│   │   ├── cli/         # CLIコマンド実装
│   │   ├── core/        # コア機能（Hub、Registry等）
│   │   ├── servers/     # NPX/Remote MCPサーバー
│   │   ├── config/      # 設定管理
│   │   ├── storage/     # データストレージ
│   │   ├── transport/   # 通信層
│   │   ├── runtime/     # ランタイム抽象化
│   │   └── utils/       # ユーティリティ
│   ├── dist/            # ビルド出力
│   ├── package.json     # 依存関係とスクリプト
│   ├── tsconfig.json    # TypeScript設定
│   ├── biome.jsonc      # Biome設定
│   └── vitest.config.ts # Vitest設定
└── docs/                # ドキュメント
    └── spec-v0.0.1.md   # 仕様書
```

## 現在の実装状況
- Honoベースの基本的なHTTPサーバー（ポート3000）
- TypeScript + ESM セットアップ
- Biome による lint/format 設定
- Vitest によるテスト環境
- Commander CLIツール `hatago` の実装
- Phase 0: ✅ 完了（ツール名衝突回避、セッション管理、設定ホットスワップ）
- Phase 1: ✅ 完了（リモートMCPプロキシ（HTTP/SSE）、CLI管理）
- Phase 2: ✅ 完了（npx経由MCPプロキシ対応）

## パッケージ情報
- **name**: @himorishige/hatago
- **version**: 0.0.2
- **bin**: hatago CLI コマンド