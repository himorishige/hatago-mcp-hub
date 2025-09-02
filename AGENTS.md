# AGENTS ガイドライン（開発支援用）

このドキュメントは、リポジトリで作業する AI エージェント／開発者向けの運用ガイドです。基本方針、モノレポ構成、開発コマンド、リリース運用、ドキュメント方針などを最新の状態でまとめています。

— ドキュメントは日本語（です・ます調）で記載します。技術文書ではキャラクター口調は使用しません。

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

## 前提ツール・環境

- Node.js 20 以上（`engines` に準拠）
- TypeScript（ESM）
- Lint/Format: ESLint + Prettier（ルートの `eslint.config.js`/`prettier.config.js` と `pnpm` スクリプトに準拠）

## 開発コマンド（ルート）

- 依存関係のインストール: `pnpm install`
- ビルド（全パッケージ）: `pnpm -r build`
- 型チェック: `pnpm -r typecheck` または `pnpm check`
- テスト（Vitest）: `pnpm -r test`
- Lint/Format: `pnpm lint` / `pnpm format`
- パッケージ個別開発: `cd packages/<name> && pnpm dev`

補足:

- サンドボックス環境などで Vitest のワーカープールが制限される場合、`packages/core/vitest.config.ts` の `pool: 'forks'` を利用します。
- 実行時に問題が出る場合は、対象パッケージディレクトリで `pnpm test` を実行してください。

## コーディング規約

- TypeScript（strict）。`any` や非 null アサーションは極力避けます。
- ファイル名は kebab-case（例: `sse-manager.ts`）。
- 小さく理解しやすいモジュールを保ち、型は可能な限り近接配置します。
- エラーは型で表現し、明確なメッセージを返します。

ESLintポリシー（抜粋）:

- `@typescript-eslint/no-unsafe-*` を原則エラーに設定しています。回避のために `eslint-disable` は基本的に使用しません。Node ビルトインを使うユーティリティでは、`node:` 名前空間の import と最小限の型シム（`packages/core/src/types/node-shim.d.ts`）で対応します。
- 未使用変数は `_` プレフィックスで許容します（`@typescript-eslint/no-unused-vars` の設定に準拠）。

## テスト方針

- フレームワーク: Vitest
- 置き場所: ソース隣接 `*.test.ts`
- 単体テストを基本とし、責務のオーナーで統合テストを追加します。
- Node 依存のファイル操作（シンボリックリンク等）は CI/サンドボックスで不安定になる場合があるため、必要に応じてスキップまたはフォールバックの分岐テストを用意します。

## コミット / PR

- Conventional Commits を推奨: `feat`, `fix`, `docs`, `chore`, `refactor`, `style`, `perf`, `test`
- 小さく原子的に。説明・理由・テスト観点・ドキュメント更新点を PR に記載します。

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
- 詳細な手順は `docs/release-guide.ja.md` を参照してください。

## ドキュメント方針

- 基本は日本語の丁寧語で記載します（キャラクター口調は使用しません）。
- 英語版が必要な場合は内容を揃えて併記します（例: `docs/release-guide.md`）。
- 見出しは簡潔にし、まず手順やコード例を提示します。

## OSS 必須ファイル（整備済み）

- `LICENSE`（MIT）
- `CODE_OF_CONDUCT.md`（連絡先: X の DM）
- `SECURITY.md`（連絡先: X の DM / GHSAs）
- `CONTRIBUTING.md`（開発/ドキュメント規約）
- `.npmrc`（`access=public` 等）
- `.gitignore`, `.gitattributes`, `.git-blame-ignore-revs`
- `.github/ISSUE_TEMPLATE/*`, `.github/PULL_REQUEST_TEMPLATE.md`, `.github/CODEOWNERS`

## 参考ドキュメント

- アーキテクチャ: `docs/ARCHITECTURE.md`, `docs/hub-architecture-deep-dive.md`
- 設定ガイド: `docs/configuration.md`, `docs/mcp-config-examples.md`
- 進捗通知: `docs/PROGRESS_NOTIFICATIONS.md`
- リリース運用: `docs/release-guide.ja.md` / `docs/release-guide.md`

## 環境依存ユーティリティの方針

- `@himorishige/hatago-core` は環境非依存を基本とします。Node 依存ユーティリティ（例: `utils/path-resolver`）は「サブパスのみ」エクスポートとし、`src/index.ts` からの一括再エクスポートには含めません。これにより Deno/Bun/Workers でも `core` のデフォルト入口を安全に利用できます。
- Node 依存コードでは `import 'node:fs'` 等の `node:` 名前空間を使用します。Deno/Bun/Workers では当該ユーティリティを直接使用せず、各環境向けのアダプタ実装を用意してください。

以上です。疑問点や更新が必要な点があれば Issue または PR でお知らせください。
