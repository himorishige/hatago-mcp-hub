# Hatago Monorepo Structure - Phase 1 完了

## 実施内容 (2025-08-28)

### 1. モノレポ基盤の構築

- pnpm-workspace.yaml を作成
- packages/, server/, examples/ をワークスペースとして設定
- ルートレベルのtsconfig.jsonを追加

### 2. @hatago/coreパッケージの作成

**パス**: packages/core/
**内容**:

- types/ - プロトコル、接続、セッション、レジストリの型定義
- errors/ - エラーコードと重要度定義
- events/ - サーバー、ツール、リソース、プロンプト、セッションイベント契約
- 副作用ゼロ、外部依存は@modelcontextprotocol/sdkのみ
- tsdownでビルド設定（tsupではなく）

### 3. examplesディレクトリ

**パス**: examples/minimal-mcp/

- 70行以下の最小MCPサーバー実装例
- echoツール1つのみ
- 10分以内で動作確認可能

### 4. serverパッケージの更新

- @hatago/core を workspace依存として追加
- 今後、段階的に型定義を@hatago/coreから参照するように移行予定

## 依存方向の原則

```
core → runtime → transport → cli
```

（逆方向の依存は禁止）

## 次のフェーズ

1. server/src/core/types.ts から@hatago/coreへの参照を切り替え
2. @hatago/runtimeパッケージの作成（セッション管理、ルーティング）
3. @hatago/transportパッケージの作成（STDIO、HTTP、SSE）

## ビルドコマンド

```bash
# @hatago/coreのビルド
cd packages/core && pnpm build

# 全体の依存関係インストール
pnpm install
```
