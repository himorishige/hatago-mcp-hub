# Hatago MCP Hub - Phase 2 実装状況

## 完了したタスク

### Phase 1の修正
- ID生成のModulo Bias脆弱性を修正（crypto.randomUUID()とRejection Sampling）
- Semaphore Race Conditionを修正（Promise内での状態変更）
- Runtime初期化をシングルトンパターンに統一
- Cloudflare Workers対応（nodejs_compat活用）
- wrangler.toml設定ファイルの作成

### Phase 2 - NPX MCPサーバープロキシ

#### 1. NPX MCPサーバー管理
- `src/servers/npx-mcp-server.ts`: NpxMcpServerクラス
  - npx経由でMCPサーバーを起動・管理
  - STDIO通信の管理
  - プロセスライフサイクル管理
  - 自動再起動機能（設定可能な再起動回数と遅延）

#### 2. ワークスペース管理
- `src/servers/workspace-manager.ts`: WorkspaceManagerクラス
  - 一時ディレクトリの作成・管理
  - パッケージキャッシュ管理
  - 古いワークスペースの自動クリーンアップ
  - メタデータの永続化

#### 3. サーバーレジストリ
- `src/servers/server-registry.ts`: ServerRegistryクラス
  - NPXサーバーの動的登録
  - サーバー状態の管理（starting, running, stopping, stopped, crashed）
  - ツール自動認識（tools/listメソッド）
  - ヘルスチェック機能

#### 4. CLIコマンド拡張
- `src/cli/commands/npx.ts`: NPXコマンドハンドラー
  ```
  hatago npx add <package>    # NPXサーバーを追加
  hatago npx remove <id>       # NPXサーバーを削除
  hatago npx list             # 登録されたNPXサーバー一覧
  hatago npx start <id>       # サーバーを起動
  hatago npx stop <id>        # サーバーを停止
  hatago npx restart <id>     # サーバーを再起動
  hatago npx status <id>      # サーバーの詳細状態
  ```

## 技術的な成果

### 新規追加パッケージ
- chalk: CLIの色付き出力
- cli-table3: テーブル形式の表示

### アーキテクチャパターン
- プロセス管理（child_process.spawn）
- ワークスペース分離パターン
- サーバーレジストリパターン
- イベント駆動型サーバー管理

### セキュリティ対策
- Modulo Bias脆弱性の修正
- Race Conditionの解消
- プロセスの適切な終了処理
- ワークスペースの隔離

## 残りのタスク

### MCPハブへの統合
- NpxMcpServerをMcpHubに統合
- 動的なツール登録・削除
- セッション管理の拡張

### エラーハンドリング強化
- プロセスゾンビの防止
- メモリリークの対策
- タイムアウト処理の改善

### テストとドキュメント
- 単体テストの作成
- 統合テストの実装
- ユーザーガイドの作成

## 重要な設計決定

1. **プロセス管理**: child_processを使用してnpxコマンドを実行
2. **ワークスペース**: 各サーバーを隔離された一時ディレクトリで実行
3. **自動再起動**: 設定可能な再起動ポリシー（maxRestarts, restartDelayMs）
4. **ツール検出**: JSON-RPC経由でtools/listを呼び出し

## ビルド・実行
```bash
pnpm build  # TypeScriptのビルド
pnpm check  # Lintとフォーマット

# NPXサーバーの管理
hatago npx add @modelcontextprotocol/server-filesystem
hatago npx list
hatago npx status <id>
```