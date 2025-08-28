# Hatago Monorepo Phase 2 進捗

## 完了内容 (2025-08-28)

### Phase 2A: 基本構造
✅ server/src/core/types.ts → @hatago/coreから再エクスポート
✅ @hatago/runtimeパッケージ作成
✅ セッション管理の移行完了

### Phase 2B: レジストリの移行
✅ tool-registry.ts → @hatago/runtime/registry
✅ resource-registry.ts → @hatago/runtime/registry  
✅ prompt-registry.ts → @hatago/runtime/registry
✅ registry/index.ts作成

### 現在の構造
```
packages/
├── core/         # 型定義のみ（副作用ゼロ）
├── runtime/      # 実行時コンポーネント
│   ├── session/  # セッション管理
│   ├── registry/ # ツール/リソース/プロンプト登録
│   └── mutex.ts  # 排他制御
└── (future: transport, cli)
```

## 残タスク

### Phase 2C: ルーター移行
- [ ] mcp-router.ts → @hatago/runtime/router
- [ ] mcp-router-functional.ts移行
- [ ] router/types.ts作成

### Phase 2D: エラー回復
- [ ] error-recovery.ts → @hatago/runtime/retry
- [ ] サーキットブレーカー分離
- [ ] バックオフ戦略分離

### Phase 2E: McpHubリファクタリング
- [ ] serverで@hatago/runtimeを利用
- [ ] McpHubクラスをファサード化
- [ ] 1693行 → 500行目標

## 注意点
- ビルド時間が長くなる問題が発生
- 循環参照の可能性を調査必要
- 型定義の依存関係を整理必要

## 依存方向
```
@hatago/core → @hatago/runtime → server
```
（逆方向は禁止）