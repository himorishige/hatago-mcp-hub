# AGENTS ガイドライン（開発支援用）

このドキュメントは、リポジトリで作業する AI エージェント／開発者向けの運用ガイドです。基本方針、モノレポ構成、テックスタック、開発コマンド、CLI/設定、MCP 準拠要点、設計哲学、リリース運用、ドキュメント方針などを最新の状態でまとめています。

— ドキュメントは日本語（です・ます調）で記載します。技術文書ではキャラクター口調は使用しません。

## プロジェクト概要

Hatago MCP Hub は、複数の MCP（Model Context Protocol）サーバーを一元管理する軽量ハブです。Claude Code / Codex CLI / Cursor / Windsurf / VS Code など各種クライアントから、ローカル/NPX/リモートの MCP サーバーへ透過的に接続するための中継点を提供します。設計の核は「薄い実装（最低限の転送・管理に徹する）」です。

## テックスタック

- ランタイム: Node.js 20+（Cloudflare Workers 対応: リモートサーバー接続機能中心）
- 言語: TypeScript（ESM, strict）
- Web フレームワーク: Hono（HTTP モード）
- MCP SDK: `@modelcontextprotocol/sdk`（Zod ベースの schema 必須）
- ビルド: tsdown
- テスト: Vitest
- Lint/Format: ESLint + Prettier（現行の実行スクリプトに準拠）
- パッケージマネージャー: pnpm

補足: 一部ドキュメントに Biome 言及がありますが、現状のルート実行コマンドは ESLint/Prettier を使用します（`pnpm lint` / `pnpm format`）。

## モノレポ構成

- パッケージマネージャー: `pnpm`
- 主要ワークスペース（公開想定スコープ: `@himorishige/*`）
  - `packages/core` → `@himorishige/hatago-core`
  - `packages/runtime` → `@himorishige/hatago-runtime`
  - `packages/transport` → `@himorishige/hatago-transport`
  - `packages/hub` → `@himorishige/hatago-hub`
  - `packages/server` → `@himorishige/hatago-server`
  - `packages/cli` → `@himorishige/hatago-cli`
  - `packages/mcp-hub` → `@himorishige/hatago-mcp-hub`（現行の公開対象）
- その他
  - `examples/`: サンプル（Node / Workers）
  - `docs/`: アーキテクチャ、設定、運用ガイド
  - `schemas/`: JSON Schema とサンプル設定（`schemas/config.schema.json`）

参考ツリー（抜粋）:

```
packages/
  mcp-hub/      # メイン npm パッケージ（CLI `hatago` 提供）
  server/       # HTTP/StreamableHTTP サーバー実装
  hub/          # ハブ中核（ルーティング/レジストリ）
  core/         # 共通型/定数
  runtime/      # 実行時コンポーネント
  transport/    # STDIO/HTTP/SSE 等のトランスポート
schemas/
  config.schema.json  # 設定スキーマ
examples/
  node-example/
  workers-example/
```

## 前提ツール・環境

- Node.js 20 以上（`engines` に準拠）
- TypeScript（ESM）
- Lint/Format: ESLint + Prettier（ルートの `eslint.config.js`/`prettier.config.js` と `pnpm` スクリプトに準拠）

HTTP モードの追加オプション（計測/ログ）:

- `HATAGO_METRICS=1` でインメモリ計測を有効化し `/metrics` を公開
- `HATAGO_LOG=json`（`HATAGO_LOG_LEVEL` に準拠）で JSON ログを有効化

## 開発コマンド（ルート）

- 依存関係のインストール: `pnpm install`
- ビルド（全パッケージ）: `pnpm -r build`
- 型チェック: `pnpm -r typecheck` または `pnpm check`
- テスト（Vitest）: `pnpm -r test`
- Lint/Format: `pnpm lint` / `pnpm format`
- パッケージ個別開発: `cd packages/<name> && pnpm dev`

実行補助:

- STDIO サーバー（要 config）: `pnpm serve:stdio`
- HTTP サーバー（お試し/デバッグ）: `pnpm serve:http`

補足:

- サンドボックス環境などで Vitest のワーカープールが制限される場合、`packages/core/vitest.config.ts` の `pool: 'forks'` を利用します。
- 実行時に問題が出る場合は、対象パッケージディレクトリで `pnpm test` を実行してください。

## CLI と主要機能

`@himorishige/hatago-mcp-hub` は `hatago` CLI を提供します（グローバル or `npx` 実行）。

- 初期化: `npx @himorishige/hatago-mcp-hub init`
- 起動（STDIO, 推奨・要 config）: `hatago serve --stdio --config ./hatago.config.json`
- 起動（HTTP, デバッグ向け）: `hatago serve --http`
- 設定監視: `hatago serve --watch`
- 詳細ログ: `hatago serve --verbose`
- タグによる起動フィルタ: `hatago serve --tags dev,test`（OR 条件／日本語タグ可）

内部リソース（最小構成）:

- `hatago://servers` — 現在接続中のサーバー一覧を JSON で参照できます。

## コーディング規約

- TypeScript（strict）。`any` や非 null アサーションは極力避けます。
- ファイル名は kebab-case（例: `sse-manager.ts`）。
- 小さく理解しやすいモジュールを保ち、型は可能な限り近接配置します。
- エラーは型で表現し、明確なメッセージを返します。

MCP 固有のスタイル:

- ツール名は `snake_case` を用います（MCP 仕様準拠）。

ESLintポリシー（抜粋）:

- `@typescript-eslint/no-unsafe-*` を原則エラーに設定しています。回避のために `eslint-disable` は基本的に使用しません。Node ビルトインを使うユーティリティでは、`node:` 名前空間の import と最小限の型シム（`packages/core/src/types/node-shim.d.ts`）で対応します。
- 未使用変数は `_` プレフィックスで許容します（`@typescript-eslint/no-unused-vars` の設定に準拠）。

## MCP 準拠（重要な実装上の注意）

- STDIO では「改行区切り JSON」を出力します。LSP 風の `Content-Length` ヘッダは不要です。
- 通知（`notifications/*`）には `id` を含めません（JSON‑RPC 準拠）。
- ツール定義は Zod ベースの `inputSchema` を使用します（プレーンオブジェクト不可）。

例（良い例/悪い例の要点）:

```ts
// ✅ STDIO: 改行で区切る
writer.write(JSON.stringify(message) + '\n');

// ❌ Content-Length を自前で組み立てない
```

```ts
// ✅ 通知に id は含めない
{ jsonrpc: '2.0', method: 'notifications/progress', params: { ... } }

// ❌ id を入れない
```

```ts
// ✅ Zod を使ったツール定義
server.registerTool('tool_name', { inputSchema: z.object({ p: z.string() }) }, handler);

// ❌ プレーンオブジェクトの schema を渡さない
```

## テスト方針

- フレームワーク: Vitest
- 置き場所: ソース隣接 `*.test.ts`
- 単体テストを基本とし、責務のオーナーで統合テストを追加します。
- Node 依存のファイル操作（シンボリックリンク等）は CI/サンドボックスで不安定になる場合があるため、必要に応じてスキップまたはフォールバックの分岐テストを用意します。

## 設定（概要）

基本構造:

```json
{
  "$schema": "https://raw.githubusercontent.com/himorishige/hatago-mcp-hub/main/schemas/config.schema.json",
  "version": 1,
  "logLevel": "info",
  "mcpServers": {
    "server-id": {
      // ローカル/NPX サーバー
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": { "KEY": "${ENV_VAR}" },
      "cwd": "./path",

      // リモートサーバー
      "url": "https://api.example.com/mcp",
      "type": "http" | "sse",
      "headers": { "Authorization": "Bearer ${TOKEN}" },

      // 共通
      "disabled": false,
      "tags": ["dev", "production"]
    }
  }
}
```

環境変数展開（Claude Code 互換）:

- `${VAR}` 必須、`${VAR:-default}` 既定値あり

タグフィルタリング:

- `hatago serve --tags dev,test` のように OR 条件で選別します（日本語タグ可）。

## コミット / PR

- Conventional Commits を推奨: `feat`, `fix`, `docs`, `chore`, `refactor`, `style`, `perf`, `test`
- 小さく原子的に。説明・理由・テスト観点・ドキュメント更新点を PR に記載します。

## 設計哲学（薄い実装）

方針:

- 追加より削減を優先し、変換より転送を優先します。
- 判断や最適化を極力持ち込まず、中継・接続・監視に限定します。

採用しやすい機能（例）:

- パススルー、簡易なフィルタ（タグ）、基本的な並列化、ヘルスチェック、軽量メトリクス（記録のみ）

採用しない機能（例）:

- AI 統合（メモリ/推論）、キャッシュシステム、複雑なルーティング/データ変換、アプリ固有のビジネスロジック

追加判断の目安（満たさなければ見送り）:

- 100 行超の大規模追加にならないこと／新規依存を増やさないこと／データ変換や状態保持を伴わないこと／中継として単純であること

## セキュリティと設定

- 秘密情報はコミットしません。環境変数を用い、設定の参照展開（`${VAR}` / `${VAR:-default}`）を活用します。
- 設定は `schemas/config.schema.json` で検証します。`timeouts`（グローバルおよびサーバー個別）を含みます。
- 脆弱性報告は X（Twitter）の DM（[@\_himorishige](https://x.com/_himorishige)）または GitHub Security Advisories をご利用ください。詳細は `SECURITY.md` を参照してください。

スキーマ生成について:

- 生成スクリプトは `packages/server/scripts/generate-schema.ts` にあります。`pnpm -C packages/server build:schema` で `schemas/config.schema.json` を再生成します。
- `timeouts` の最小値/最大値/デフォルトは `@himorishige/hatago-core` の定数（`MIN_TIMEOUT_MS`、`MAX_TIMEOUT_MS`、`DEFAULT_*_TIMEOUT_MS`）に追従します（重複定義を避けます）。

## リリース運用

- README に npm / GitHub Release バッジを掲載済みです。
- Release Drafter により PR ラベルからリリースノートを自動下書きします。
  - 設定: `.github/release-drafter.yml`
  - Workflow: `.github/workflows/release-drafter.yml`
- `v*` タグの push で GitHub Release を自動作成します。
  - Workflow: `.github/workflows/release.yml`
- npm 公開（現状）
  - 対象: `packages/mcp-hub` → `@himorishige/hatago-mcp-hub`
  - 事前手順: `pnpm -r build && pnpm -r test && pnpm -r typecheck`
  - 公開: `cd packages/mcp-hub && npm publish --access public`

## ドキュメント方針

- 基本は日本語の丁寧語で記載します（キャラクター口調は使用しません）。
- 英語版が必要な場合は内容を揃えて併記します。
- 見出しは簡潔にし、まず手順やコード例を提示します。

関連ドキュメント（抜粋）:

- アーキテクチャ: `docs/ARCHITECTURE.md`, `docs/refactoring/hub-slim-plan.md`
- 設定ガイド: `docs/configuration.md`
- パッケージREADME: `packages/mcp-hub/README.md`
- ユースケース: `docs/use-cases/team-development.md`

## OSS 必須ファイル（整備済み）

- `LICENSE`（MIT）
- `CODE_OF_CONDUCT.md`（連絡先: X の DM）
- `SECURITY.md`（連絡先: X の DM / GHSAs）
- `CONTRIBUTING.md`（開発/ドキュメント規約）
- `.npmrc`（`access=public` 等）
- `.gitignore`, `.gitattributes`, `.git-blame-ignore-revs`
- `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`

## 参考ドキュメント

- アーキテクチャ: `docs/ARCHITECTURE.md`, `docs/refactoring/hub-slim-plan.md`
- 設定ガイド: `docs/configuration.md`
- ユースケース: `docs/use-cases/team-development.md`

## 環境依存ユーティリティの方針

- `@himorishige/hatago-core` は環境非依存を基本とします。Node 依存ユーティリティ（例: `utils/path-resolver`）は「サブパスのみ」エクスポートとし、`src/index.ts` からの一括再エクスポートには含めません。これにより Deno/Bun/Workers でも `core` のデフォルト入口を安全に利用できます。
- Node 依存コードでは `import 'node:fs'` 等の `node:` 名前空間を使用します。Deno/Bun/Workers では当該ユーティリティを直接使用せず、各環境向けのアダプタ実装を用意してください。

以上です。疑問点や更新が必要な点があれば Issue または PR でお知らせください。
