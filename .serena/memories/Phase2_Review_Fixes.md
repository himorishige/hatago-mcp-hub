# Phase 2 レビュー修正状況

## hatago-code-reviewerからの指摘事項と対応

### ✅ 修正完了

#### 1. プロセス管理における並行処理の脆弱性
- **問題**: `NpxMcpServer.start()`で複数の同時起動が可能
- **修正**: startPromiseとstopPromiseを追加して並行制御を実装
- **詳細**: 
  - performStart()とperformStop()メソッドに分離
  - 既に実行中のPromiseがあれば再利用
  - ファイル: `src/servers/npx-mcp-server.ts`

#### 2. ツール発見処理でのメモリリーク
- **問題**: onStdoutメソッドがリスナーの削除関数を返していない
- **修正**: onStdout/onStderrがクリーンアップ関数を返すように変更
- **詳細**:
  - removeListenerを呼び出すクロージャを返却
  - waitForDiscoveryResponseでクリーンアップ関数を保存・使用
  - ファイル: `src/servers/npx-mcp-server.ts`, `src/servers/server-registry.ts`

#### 3. ワークスペース作成時のレースコンディション
- **問題**: 複数のcreateWorkspaceが同時実行時にディレクトリ作成が失敗
- **修正**: リトライロジックを追加
- **詳細**:
  - EEXISTエラー時に新しいIDで最大3回リトライ
  - recursive: falseで原子的なディレクトリ作成
  - ファイル: `src/servers/workspace-manager.ts`

#### 4. プロセス終了タイムアウトの改善
- **問題**: 5秒の強制終了タイムアウトが短すぎる
- **修正**: 設定可能なshutdownTimeoutMs（デフォルト10秒）を追加
- **詳細**:
  - NpxServerConfigにshutdownTimeoutMsプロパティを追加
  - ファイル: `src/config/types.ts`, `src/servers/npx-mcp-server.ts`

### ⏳ 未対応（次のタスク）

#### 1. ヘルスチェック失敗時の自動復旧
- 連続失敗回数のカウント機能
- 自動再起動の実装

#### 2. CLIコマンドの重複コード削除
- WorkspaceManagerとServerRegistryの初期化ヘルパー関数作成

#### 3. MCP初期化プロトコルに準拠したreadiness判定
- JSON-RPC initializeリクエスト/レスポンスの実装

## 技術的改善点

### セキュリティ
- プロセス起動の並行制御により重複起動を防止
- メモリリークの解消によるリソース枯渇攻撃の防止

### 信頼性
- ワークスペース作成の競合状態解決
- 適切なリスナー管理によるメモリリーク防止
- 設定可能なタイムアウトによる柔軟な運用

### パフォーマンス
- 不要なプロセス起動の防止
- リソースの適切な解放

## 今後の改善予定
1. ヘルスチェック失敗時の自動リカバリー
2. CLIコマンドのコード重複解消
3. MCP仕様準拠のreadiness判定実装
4. 統合テストの追加