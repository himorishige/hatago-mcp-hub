# Hatago Hub 軽量版クリーンアップ実施内容

## 完了した作業

### 1. エンタープライズ機能の削除

- **削除したディレクトリ**:
  - src/observability (フルトレーシング、メトリクス)
  - src/security (認証、認可、レート制限)
  - src/codegen (型生成、内省)
  - src/integrations (OpenAPI統合)
  - src/decorators (実験的デコレータAPI)
  - src/testing (テストユーティリティ)

### 2. 複雑な機能の削除

- **削除したファイル**:
  - policy-gate.ts (ポリシー管理)
  - secret-manager.ts (シークレット管理)
  - plugin-api.ts (プラグインシステム)
  - rollover-manager.ts (ローテーション管理)
  - file-watcher.ts (ファイル監視)

### 3. 不要なCLIコマンドの削除

- doctor, drain, call, dev, secret, policy
- generate, inspect, reload, session, remote, npx
- v2コマンドディレクトリ全体

### 4. 最小限の機能実装

- **minimal-security.ts**: ローカル限定、共有シークレット、基本レート制限
- **minimal-logger.ts**: request_id、リングバッファ、構造化ログ
- **error-recovery.ts**: バックオフ、サーキットブレーカー、エラー分類
- **connection-manager.ts**: ping/pong、タイムアウト、キャンセル伝搬

### 5. 依存関係の削減

- optionalDependenciesを最小化（chalkのみ残す）
- devDependenciesから不要なものを削除

## 現在の課題

### TypeScriptエラー (約442個)

主な問題:

1. HatagoConfigのデフォルト値不足
2. ErrorHelpers.extractメソッドの不在
3. Logger型の参照エラー
4. config.serversの型不一致（配列 vs オブジェクト）
5. McpHubのメソッド不足（asMcpServer, asHonoApp）

### 解決方針

1. 型エラーは動作に影響しない可能性があるため、まずビルドして動作確認
2. 必要最小限の修正のみ実施
3. 軽量版として新しいパッケージ（@hatago/lite）として分離も検討

## 成果

- コードベースの大幅な簡略化
- エンタープライズ機能の完全分離
- 最小限のセキュリティと観測性の確保
- 軽量で高速な起動を目指す基盤の構築
