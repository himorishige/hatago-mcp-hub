# Hatago Hub リファクタリング分析

## 現在のモジュール構造と依存関係

### コア機能（必須）
- `src/core/`: MCPハブ、セッション管理、ツール・リソースレジストリ
- `src/transport/`: STDIO、HTTP、WebSocketトランスポート
- `src/config/`: 設定管理、バリデーション
- `src/proxy/`: サーバー管理、名前解決
- `src/servers/`: NPX、リモート、ローカルサーバー管理
- `src/storage/`: レジストリストレージ
- `src/utils/`: ユーティリティ（ロガー、エラー処理等）

### エンタープライズ機能（オプショナル候補）
1. **observability/** - 監視・計測機能
   - health-monitor.ts: ヘルスチェック
   - metrics.ts: Prometheusメトリクス
   - tracing.ts: 分散トレーシング
   - structured-logger.ts: 構造化ログ

2. **security/** - セキュリティ機能
   - authenticator.ts: JWT認証
   - authorizer.ts: ロールベース認可
   - rate-limiter.ts: レート制限

3. **codegen/** - コード生成
   - type-generator.ts: TypeScript型生成
   - introspector.ts: MCPイントロスペクション

4. **integrations/** - 外部統合
   - openapi-generator.ts: OpenAPI統合

5. **decorators/** - 実験的API
   - デコレータベースのサーバー定義

### 問題点
1. **ハードコーディング**: serveコマンドでobservability/health-monitorが直接インポートされている
2. **回路ブレーカー**: proxy/circuit-breakerが過剰に複雑
3. **依存関係**: エンタープライズ機能がコアに結合している

### 軽量化方針
1. エンタープライズ機能を条件付きインポートに変更
2. 設定で機能のON/OFF切り替え
3. 最小構成のエントリーポイント作成