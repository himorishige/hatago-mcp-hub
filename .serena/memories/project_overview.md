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
- **CLI**: Commander + Zod v4

## プロジェクト構造
```
/
├── app/              # メインアプリケーション
│   ├── src/
│   │   └── index.ts  # エントリーポイント（Honoサーバー）
│   ├── package.json  # 依存関係とスクリプト
│   ├── tsconfig.json # TypeScript設定
│   ├── biome.jsonc   # Biome設定
│   └── vitest.config.ts # Vitest設定
└── docs/             # ドキュメント
    └── spec-v0.0.1.md # 仕様書
```

## 現在の実装状況
- Honoベースの基本的なHTTPサーバー（ポート3000）
- TypeScript + ESM セットアップ
- Biome による lint/format 設定
- Vitest によるテスト環境

## 今後の実装予定
- Phase 0: ツール名衝突回避、セッション管理、設定ホットスワップ
- Phase 1: リモートMCPプロキシ（HTTP/SSE）、CLI管理
- Phase 2: npx経由MCPプロキシ対応