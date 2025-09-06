# Hatago MCP Hub 設計哲学

## 作成日: 2025-09-06

## 更新: CLAUDE.mdに正式に記載

## Core Mantra - 「薄さ」という魔法

Hatagoの本質は「薄い実装」にある。これは意図的な設計選択であり、プロジェクトの最重要原則。

### Hatagoのマントラ

- **「追加するな、削れ」** - 機能追加より削減を優先
- **「変換するな、転送せよ」** - データ加工を避け、透過的に転送
- **「判断するな、通過させよ」** - 複雑なロジックを避け、単純な中継
- **「厚くなるな、薄くあれ」** - 常に最小限の実装を維持

## Design Principles - 薄い実装の原則

### 1. 透過性の維持 (Transparency)

良い例：単純な転送

```typescript
async callTool(name, args) {
  const server = this.resolveServer(name);
  return server.call(name, args);
}
```

避けるべき例：複雑な処理

```typescript
async callTool(name, args) {
  const enhanced = await this.analyzeContext(args);
  const optimized = await this.optimizeQuery(enhanced);
  const result = await this.execute(optimized);
  return this.postProcess(result);
}
```

### 2. 最小限の介入 (Minimal Intervention)

**Hatagoが行うこと：**

- 名前空間の付与/解決
- 接続の管理
- エラーの転送
- プログレス通知の中継

**Hatagoが行わないこと：**

- データの変換や加工
- 結果のキャッシング
- 複雑なエラーリカバリー
- AIによる最適化

### 3. 設定より規約 (Convention over Configuration)

最小限の設定で動作：

```json
{
  "mcpServers": {
    "server1": { "command": "..." }
  }
}
```

## Feature Addition Criteria - 機能追加の判断基準

新機能を追加する前に、以下の基準をすべて満たすか確認：

1. **コード追加量は100行以下か？**
2. **新しい依存関係が必要か？**（必要なら追加しない）
3. **データを変換/加工するか？**（するなら追加しない）
4. **状態を保持するか？**（保持するなら追加しない）
5. **単純な転送/中継か？**（そうでないなら追加しない）

## Acceptable vs Unacceptable Features

### ✅ 採用可能な「薄い」機能

- **パススルー機能**: そのまま転送
- **シンプルなフィルタ**: タグによる単純な選別
- **基本的な多重化**: Promise.allによる並列処理
- **メトリクス収集**: 記録のみ、分析はしない
- **ヘルスチェック**: 単純なping
- **接続プール**: 再利用のみ、複雑な管理なし

### ❌ 絶対に追加しない「厚い」機能

- **AI統合**: メモリや推論システム
- **キャッシュシステム**: 状態管理が必要
- **複雑なルーティング**: ビジネスロジックを含む
- **データ変換パイプライン**: 入出力の加工
- **ビジネスロジック**: アプリケーション固有の処理

## 現在のコアサイズ

- hub.ts: 約500行
- internal-tools.ts: 約100行
- types.ts: 約50行

この軽量性を維持することが、Hatagoの競争優位性。

## 実装時の心構え

開発者は常に以下を自問すべき：

1. この機能は本当に必要か？
2. もっとシンプルな方法はないか？
3. 削れる部分はないか？
4. 透過的な実装になっているか？

「迷ったら追加しない」が基本姿勢。

## 更新履歴

- 2025-09-06: 初版作成、CLAUDE.mdに正式記載
