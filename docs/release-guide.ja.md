# リリース運用ガイド（Hatago MCP Hub）

本書は、GitHub Releases と npm 公開を最小構成で安定運用するための手順をまとめたものです。
Release Drafter と「タグ → GitHub Release 自動作成」ワークフローを前提としています。

## 目的

- README と GitHub 上で常に最新バージョンを分かりやすく表示します。
- `v*` 形式のタグを push するだけで GitHub Release を自動作成します。
- 公開対象（現状: `@himorishige/hatago-mcp-hub`）を安全に npm へ配布します。

## 前提条件

- ブランチ保護: `main`
- ラベル運用: `feat`, `fix`, `chore`, `docs`, `refactor`, `perf`, `test`、必要に応じて `semver:major`
- GitHub Actions を有効化
  - `.github/workflows/release-drafter.yml`
  - `.github/workflows/release.yml`
- README のバッジ設定
  - npm: `@himorishige/hatago-mcp-hub`
  - GitHub Release: `himorishige/hatago-mcp-hub`

## バージョニング方針（SemVer）

- 形式: `MAJOR.MINOR.PATCH`
- 互換性破壊: MAJOR、機能追加: MINOR、不具合修正: PATCH を原則とします。
- リリースノートは Release Drafter が PR ラベルから自動生成します（必要に応じて手動で加筆・修正してください）。

## ラベル運用（Release Drafter 連携）

- Features: `feat`, `feature`, `semver:minor`
- Fixes: `fix`, `bugfix`, `bug`, `semver:patch`
- Maintenance: `chore`, `refactor`, `deps`
- Docs: `docs`
- Performance: `perf`
- Tests: `test`
- 破壊的変更がある場合は `semver:major` を付与してください。

## 標準フロー

1. 作業ブランチで変更します（Conventional Commits を推奨します）。
2. PR を作成し、該当ラベルを付与します。
3. CI が成功したら `main` にマージします。
   - Release Drafter がドラフトリリースノートを自動更新します。
4. バージョンを決定し、タグを作成して push します。
   ```bash
   # 例: v0.4.0 をリリースする場合
   git pull origin main
   git tag v0.4.0
   git push origin v0.4.0
   ```
5. `release.yml` により GitHub Release が自動作成されます（ドラフト内容が反映されます）。
6. npm 公開（公開対象のみ）
   - 現在の公開対象: `packages/mcp-hub`
   - 事前確認コマンド:
   ```bash
   pnpm -r build && pnpm -r test && pnpm -r typecheck
   cd packages/mcp-hub
   npm publish --access public
   ```

## プレリリース運用（任意）

- 例: `v0.5.0-rc.1` のようなタグを利用します。
- Release 編集画面で「This is a pre-release」にチェックします。
- npm のプレリリース配布は `npm publish --tag next` などをご利用ください。

## 役割と権限

- タグ作成 / Release 公開: リポジトリの書き込み権限が必要です。
- npm 公開: npm のメンテナ権限が必要です（2FA を推奨します）。

## コマンド早見表

```bash
# すべてのパッケージを検証
pnpm -r build && pnpm -r test && pnpm -r typecheck

# リリースタグ作成とプッシュ
git tag vX.Y.Z && git push origin vX.Y.Z

# npm 公開（mcp-hub のみ）
cd packages/mcp-hub && npm publish --access public
```

## トラブルシュート

- Release が作成されない場合: タグが `v*` 形式かをご確認ください。Actions の `release` ワークフローのログも参照してください。
- ドラフトが更新されない場合: PR に適切なラベルが付いているか、`main` への push が発生しているかをご確認ください。
- npm 公開に失敗する場合: `npm whoami` と 2FA、`publishConfig.access=public` をご確認ください。`dist` が生成されているかも確認してください。

## よくある質問（FAQ）

- Q. `packages/*` をすべて公開したいです。
  - A. `private` や `publishConfig` の見直し、各パッケージの `README`、`files` / `exports` の整備が必要です。必要に応じて Changesets の導入をご検討ください。
- Q. 変更履歴（CHANGELOG）はどう管理しますか？
  - A. 当面は GitHub Releases を一次ソースとします。マルチパッケージの公開が増えた段階で Changesets 等の導入をご検討ください。

---

最小限の運用で十分な効果が得られます。あとはバージョンを決めてタグを刻むだけです。
