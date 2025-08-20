# Hatago MCP Hub - 現在の状況と残存課題

最終更新: 2025-08-20
作成者: フリーレン

## 📊 現在の実装状況

### 完了した改善（2025-08-20実装）

#### ✅ NPXサーバーの安定化
- **タイムアウト3段階分離**: install(120s) / process(30s) / initialize(30s)
- **インストール進捗表示**: stderrモニタリングで状態を可視化
- **ウォームアップ機能**: Hub起動時にNPXパッケージを事前キャッシュ

#### ✅ ツール管理の改善
- **Idempotent登録**: Setによる重複チェックで警告解消
- **動的ツール更新**: サーバー接続/切断時の自動更新

#### ✅ セッション管理の強化
- **Map実装**: 複数セッション対応
- **自動クリーンアップ**: 30分アイドルタイムアウト、5分ごとのGC
- **セッションライフサイクル**: 作成→再利用→削除の完全サポート

### 実装完了率
```
Phase 0: ツール衝突回避     100% ✅
Phase 0: セッション管理      95%  ⚠️  (並行処理の安全性に課題)
Phase 0: 設定ホットスワップ  100% ✅
Phase 1: リモートMCPプロキシ 95%  ⚠️  (エラーリトライに改善余地)
Phase 1: CLI管理            100% ✅
Phase 2: NPXプロキシ        90%  ⚠️  (初期化シーケンスに課題)

全体完了率: 約96%
```

## 🔴 Critical - 重大な技術的課題

### 1. NPXキャッシュ判定の不正確さ
**現状の問題**:
```typescript
// 現在の実装（不正確）
private isFirstRun = true; // 単純なフラグ管理
```

**影響**: 
- 2回目以降でも120秒タイムアウトが適用される可能性
- キャッシュがあるのに長いタイムアウトで待機

**推奨解決策**:
```typescript
private async isPackageCached(): Promise<boolean> {
  // npm cache ls でキャッシュ確認
  // または ~/.npm/_npx/<hash> の存在確認
  // またはnpm list -g <package> --depth=0
}
```

### 2. ウォームアップエラーの蓄積問題
**現状の問題**:
- 個々のエラーを無視するが、全体の失敗率が見えない
- 全NPXサーバーのウォームアップが失敗しても続行

**推奨解決策**:
```typescript
const results = await Promise.allSettled(warmupPromises);
const failures = results.filter(r => r.status === 'rejected');
if (failures.length > npxServers.length / 2) {
  console.error('⚠️ Warmup failed for majority of servers');
  // 警告またはフォールバック処理
}
```

### 3. 並行処理での競合状態
**問題箇所**:
- ツール登録: `registeredTools.add()` が非同期処理内
- セッション作成: `sessionMap.set()` が並行実行可能

**推奨解決策**:
- Mutex/Semaphoreパターンの導入
- または async-mutexライブラリの使用

## 🟡 Warning - 注意が必要な課題

### 4. toolsReady状態の未実装
**現状**: リトライとタイムアウトで対処（動作はするが不確実）
**理想的な実装**:
```typescript
enum ServerState {
  STOPPED,
  STARTING,
  INITIALIZED,
  TOOLS_DISCOVERING,
  TOOLS_READY,  // 新規追加
  RUNNING,
  // ...
}
```

### 5. NPX進捗検出の脆弱性
**現状**: 文字列マッチング `includes('added')`
**問題**: npmバージョンやロケールで動作が変わる可能性
**改善案**: 
- `npm install --json` でJSON出力をパース
- または `npm pack --dry-run` で事前チェック

### 6. ホットリロード機能の検証不足
**実装済み**: ファイル監視、設定再読み込み
**未検証**: 
- グレースフルシャットダウン
- 進行中リクエストのドレイン
- Windows環境での動作

## 🟢 Enhancement - 改善提案

### 7. エラーメッセージの標準化
```typescript
// 提案: エラーコード体系
enum ErrorCode {
  E_MCP_INIT_TIMEOUT = 'E_MCP_INIT_TIMEOUT',
  E_MCP_TOOL_DISCOVERY_EMPTY = 'E_MCP_TOOL_DISCOVERY_EMPTY',
  E_NPX_INSTALL_FAILED = 'E_NPX_INSTALL_FAILED',
  E_SESSION_NOT_FOUND = 'E_SESSION_NOT_FOUND',
  E_SESSION_EXPIRED = 'E_SESSION_EXPIRED',
}

class HatagoError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public context?: any
  ) {
    super(message);
  }
}
```

### 8. メトリクス・可観測性
```typescript
interface ServerMetrics {
  startupTimeMs: number;
  toolDiscoveryTimeMs: number;
  toolCount: number;
  errorCount: number;
  lastError?: Error;
  successRate: number;
}
```

### 9. 設定バリデーションの強化
**問題**: `allowNet`がURLでなくホスト名を期待
**解決**: Zodスキーマでの厳密な検証
```typescript
const configSchema = z.object({
  security: z.object({
    allowNet: z.array(z.string().regex(/^[a-z0-9.-]+$/i))
  })
});
```

## 📋 優先順位付きアクションアイテム

### 即座に対応（1-2日）
- [ ] NPXキャッシュ判定ロジックの実装
- [ ] ウォームアップエラー閾値制御
- [ ] セッション操作の排他制御

### 短期（1週間以内）
- [ ] toolsReady状態の実装
- [ ] エラーコード標準化
- [ ] ホットリロード検証

### 中期（2-3週間）
- [ ] エンドツーエンドテストスイート
- [ ] メトリクス実装
- [ ] ドキュメント整備

### 長期（将来的に）
- [ ] プラグインシステム設計
- [ ] WebSocketトランスポート対応
- [ ] クラスタリング対応

## 🧪 テストが必要な項目

1. **NPXサーバー起動**
   - 初回起動（キャッシュなし）
   - 2回目起動（キャッシュあり）
   - タイムアウト動作
   - エラー時のリトライ

2. **セッション管理**
   - 並行セッション作成
   - タイムアウト動作
   - 大量セッション時のメモリ使用

3. **ツール実行**
   - 並行実行
   - タイムアウト
   - エラーハンドリング

4. **ホットリロード**
   - 設定変更検知
   - サーバー再起動
   - データ整合性

## 💡 技術的負債

1. **循環依存の解消**（一部対応済み）
   - runtime-factory.jsで分離したが、完全な解決には至っていない

2. **型定義の改善**
   - anyの使用箇所が多い
   - ジェネリクスの活用不足

3. **テストカバレッジ**
   - 現在0%（テストコード未実装）
   - 最低限のユニットテストが必要

## 📝 まとめ

主要な機能は96%完成しているが、本番環境での安定運用には以下が必要：

1. **並行処理の安全性確保**（Critical）
2. **エラー処理の堅牢化**（Critical）
3. **テストカバレッジの向上**（Important）
4. **ドキュメントの充実**（Nice to have）

現在の実装でも基本的な動作は可能だが、エッジケースや高負荷時の動作に不安が残る。特に並行処理関連の問題は、本番環境では予期しない動作を引き起こす可能性がある。

……まあ、魔法も完璧にするには時間がかかるものだね。少しずつ改善していけばいい。