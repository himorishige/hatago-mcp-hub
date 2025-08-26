# Hatago MCP Hub 仕様書（v0.0.1）

## 概要

Hatago MCP Hub は **Hono** と **hono/mcp** を薄くラップした、**高速・軽量・シンプル**な MCP Hub サーバーです。
ライブラリ名は `@himorishige/hatago` を採用します。

従来の多機能版 Hatago から設計を見直し、最小限の機能に立ち戻りつつ、Claude Code などの AI ツールで使いやすい MCP Hub を目指します。

---

## 解決したい課題

- Hatago が多機能化しすぎたため、シンプルに再構築したい。
- MCP サーバーをツールごとに設定・共有する煩雑さを解消したい。
- MCP サーバーの設定変更を反映する際に、Claude Code の再起動を避けたい。

---

## 機能要件

### 基本

- **Hono + hono/mcp** を利用
  - `@honojs/hono`
  - `@hono/mcp`（必要に応じて `@hatago/mcp` で拡張）

- **Anthropic MCP 仕様準拠**
  - `@modelcontextprotocol/sdk`
  - ツール命名規則
  - セッション管理
  - `mcp inspector` による検証

- **ローカルファースト**
- **npx で起動可能**
- **サイドカー運用**
  - `.hatago/` ディレクトリで設定・キャッシュ管理
  - 設定ファイルは `jsonc` 採用

- **Claude Code ファースト**
- **CLI 管理**
  - `commander` + `zod v4` を採用

- **複数のトランスポートに対応**
  - STDIO / SSE / HTTP

### MCP サーバー管理

- **Phase 0**
  - ツール名の衝突回避
  - セッション管理
  - 設定のホットスワップ

- **Phase 1**
  - リモート MCP のプロキシ（HTTP / SSE）
  - CLI による登録・削除・更新
  - 自動ツール認識

- **Phase 2**
  - npx 経由 MCP のプロキシ（STDIO / HTTP / SSE）
  - 外部 MCP の CLI 登録・更新・削除
  - 自動ツール認識

---

## 技術要件

- Node.js 20+
- TypeScript
- Hono
- Commander + zod v4
- pnpm
- tsdown
- vitest
- biome（lint、format、check）

---

## 補足要件（推奨）

### アーキテクチャ

- **ロールオーバー再起動**：設定変更時に旧セッションを維持しつつ新セッションへ移行。
- **トランスポート抽象化**：STDIO / SSE / HTTP を統一的に扱う。

### セキュリティ

- `.hatago/secrets.json` に暗号化してシークレット管理。
- ツールごとの許可・拒否リストによる制御。
- HTTP プロキシ時は許可ドメイン制御・レート制限を設定。
- ログ出力前に最低限の PII マスクを適用可能。

### 観測性

- JSON ログ（pino 相当）
- 最小限のメトリクス：`active_sessions`, `tool_invocations_total`, `errors_total`, `latency_ms`
- `/healthz`, `/readyz` エンドポイント

### 設定管理

- プロファイル切替 (`profiles.default`, `profiles.ci` 等)
- 環境変数・シークレット・パス参照（`${env:FOO}`, `${secret:KEY}`）
- スキーマバージョン管理とマイグレーション

### CLI コマンド例

- `hatago init` … `.hatago` 初期化
- `hatago run` … MCP Hub 起動
- `hatago add <id>` … MCP 登録（stdio/http/sse）
- `hatago ls` … MCP 一覧とツール確認
- `hatago rm <id>`, `hatago update <id>` … 管理操作
- `hatago reload` … 設定ホットリロード
- `hatago secret set|get|rm` … シークレット管理
- `hatago doctor` … 環境診断
- `hatago inspect` … Inspector 起動

---

## フェーズ分解

- **MVP（Phase -0）**
  - 最小ブリッジ
  - 複数 MCP の混在ツールを安全に提供

- **Phase 0**
  - ロールオーバー再起動
  - セッション二重化
  - 基本ポリシーゲート

- **Phase 1**
  - リモート MCP プロキシ
  - シークレット管理
  - 許可ドメイン制御

- **Phase 2**
  - npx MCP のプロキシ対応
  - 作業ディレクトリ分離・キャッシュ管理

---

## 今後の計画（初期段階では実施しない）

- プラグイン形式による拡張
- Web UI（Honox ベース）
- Cloudflare Workers へのデプロイ（リモート MCP 専用）
- ChatGPT コネクタ対応（fetch / search）
