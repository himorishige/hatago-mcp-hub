# Hatago Simplification Phase 2 Complete

## ストレージ層の統合（2024-12-26）

### 実施内容

1. **統合ストレージクラスの作成**
   - `unified-file-storage.ts` を新規作成
   - CLI設定とランタイム状態の両方を管理

2. **削除したファイル**
   - `cli-registry-storage.ts` - CLI専用ストレージ
   - `file-registry-storage.ts` - ファイルベースストレージ
   - `registry-storage-factory.ts` - ストレージファクトリ

3. **更新したファイル**
   - `storage/types.ts` - RegistryStorageインターフェースを拡張
   - `storage/memory-registry-storage.ts` - サーバー設定管理メソッドを追加
   - `core/mcp-hub.ts` - createRegistryStorage → UnifiedFileStorage直接利用
   - `cli/utils/cli-helpers.ts` - CliRegistryStorage → UnifiedFileStorage
   - `cli/helpers/registry-helper.ts` - CliRegistryStorage → UnifiedFileStorage
   - `cli/commands/mcp.ts` - 型参照をUnifiedFileStorageに変更
   - `cli/commands/list.ts` - UnifiedFileStorageを使用

### 統合後の構造

```
storage/
├── unified-file-storage.ts  # 統合ファイルストレージ
├── memory-registry-storage.ts  # メモリストレージ（テスト用）
├── registry-storage.ts  # インターフェース定義
└── types.ts  # 型定義
```

### 成果

- ✅ ストレージクラス: 3個 → 2個（File/Memory）
- ✅ ファクトリパターンの削除でコードがシンプルに
- ✅ 永続化ファイル: 2個 → 1個（`.hatago/registry.json`）
- ✅ 設定と状態の管理が一元化
- ✅ ビルド成功
