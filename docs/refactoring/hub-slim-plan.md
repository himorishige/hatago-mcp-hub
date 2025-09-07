# Hub Slim Refactoring Plan

本ドキュメントは `packages/hub/src/hub.ts` の簡素化（薄い実装）を目的とした段階的リファクタリング計画と進行ログです。

最終更新: 2025-09-07

## 背景

`hub.ts` は 2,000 行超の大きなクラスとなっており、接続、登録、JSON‑RPC/HTTP、通知、設定監視など多くの責務が集中しています。薄い中継点というプロジェクト哲学に合わせ、段階的に分割・整理を行います（機能互換を前提）。

## 方針

- まずは「無機能変更」の分割から着手し、安全に差分を小さく進めます。
- 公開 API と挙動は維持します。
- 追加依存は導入しません。

## ステップ計画と進行状況

1. CapabilityRegistry の外出し（完了）
   - 追加: `packages/hub/src/capability-registry.ts`
   - 目的: 能力トラッキングの独立化により可読性を向上。

2. 接続ユーティリティの分離（完了）
   - 追加: `packages/hub/src/client/connector.ts`
   - 抽出: `wrapTransport` / `connectWithRetry` / `normalizeServerSpec`
   - 目的: 接続ロジックの単体把握と将来の簡素化の土台づくり。

3. 内部ツール登録の集約（完了）
   - 変更: `packages/hub/src/internal-tools.ts` に `prepareInternalRegistrations` を追加。
   - `hub.ts` は当該関数の結果をレジストリへ登録するだけに縮小。

4. JSON‑RPC/HTTP ハンドラの薄層化（進捗）
   - [完了] HTTP 薄層化: `http/handler.ts` に抽出し、`hub.ts` は委譲に変更。
   - [進捗] JSON‑RPC ケースの段階的委譲: initialize / tools.list / tools.call / prompts.list / prompts.get / ping / resources.list / resources.read / resources.templates.list を `rpc/handlers.ts` へ委譲。

5. 設定ウォッチ/リロードの分離（進捗）
   - [完了] リロード本体: `config/reload.ts` に抽出し、`doReloadConfig`/`reloadConfig` は委譲。
   - [完了] ウォッチャ本体: `config/watch.ts` に抽出し、起動時に `startConfigWatcher` を呼び出す形へ。

## 削除方針と進捗（合意済み）

- [完了] サンプリング橋渡しの完全削除（server→client の `sampling/createMessage` プロキシ）
  - 影響: `connectWithRetry` の sampling ハンドラ/広告 capability を撤去、`hub.ts` の samplingSolvers と関連ハンドリング（onmessage の特別分岐、notifications/progress 経由の転送）を撤去。
  - Hub は引き続き `sampling/createMessage` を受けた場合は `Method not supported` を返す。
- [完了] 起動時 `tools/list` の固定ウェイト（3秒）を削除
  - 影響: 初回 `tools/list` は即時に現在のレジストリを返す。接続完了は `tools/list_changed` 通知で同期。
- [完了] `handleHttpRequest` 内の簡易 SSE GET フォールバックを削除（SSE は `hub-streamable.ts` に一本化）
- [完了] ベース Hub での通知マネージャ統合を縮小（Enhanced 側へ集約）
  - 影響: Base Hub では notifications セクションの設定を解釈せず、接続/リロード時の通知はログ出力のみに簡素化。

これらは別コミットで安全に進めます。既存のテストに影響が出ないことを確認しながら段階的に実施します。

## 影響範囲

- 既存の公開 API は変更していません。
- 既存の import パスは互換（`.js` 拡張子を維持）です。

## ロールバック戦略

- 各ステップは独立コミットで、問題発生時は当該コミットのみを revert 可能です。

## 今後の検証

- TypeScript の型チェック / 既存テストの通過確認。
- `hatago serve --http` による基本動作確認（ローカル）。
