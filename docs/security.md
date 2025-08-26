# Hatago Security Guide

## Overview

Hatagoは個人向けツールとして、実用性とセキュリティのバランスを重視した設計になっています。企業利用を想定した過剰なセキュリティ対策は避け、個人開発者が快適に使用できることを優先しています。

## Log Sanitization

### 自動マスキング

Hatagoはすべてのログ出力を自動的にサニタイズします：

- **認証トークン**: Bearer/Basicトークンは `[REDACTED]` に置換
- **APIキー**: `apiKey`, `api_key` フィールドをマスク
- **パスワード**: `password`, `secret` フィールドをマスク
- **PII**: noren ライブラリによる個人情報の自動検出とマスキング

### エラー時の安全性

サニタイズ処理が失敗した場合でも、元のメッセージは出力されません：

- 固定メッセージ `[REDACTED-ERROR id=xxx]` を返却
- トラッキングIDでエラーの特定が可能
- デバッグモードでのみ詳細確認可能

## Environment Variables

### セキュリティ設定

#### `HATAGO_DEBUG_REDACTION`

- **デフォルト**: 無効
- **用途**: ログサニタイズのデバッグ（開発時のみ使用）
- **値**: `1` で有効化

```bash
# 開発時のみ
export HATAGO_DEBUG_REDACTION=1
```

### 再接続制限

#### `HATAGO_MAX_RECONNECT_DEPTH`

- **デフォルト**: 32
- **用途**: 再接続処理の最大深度
- **説明**: 無限再帰を防ぐための安全機構

#### `HATAGO_MAX_RECONNECT_STEPS`

- **デフォルト**: 10000
- **用途**: 再接続処理の最大ステップ数
- **説明**: 長時間のループを防ぐための制限

```bash
# より厳しい制限を設定
export HATAGO_MAX_RECONNECT_DEPTH=16
export HATAGO_MAX_RECONNECT_STEPS=5000
```

### ヘルスチェック

#### `HATAGO_HEALTH_TIMEOUT_MS`

- **デフォルト**: 1000 (1秒)
- **用途**: ヘルスチェックのタイムアウト時間
- **説明**: 応答しないサーバーを早期に検出

```bash
# ネットワークが遅い環境では長めに設定
export HATAGO_HEALTH_TIMEOUT_MS=3000
```

## Best Practices

### 開発環境

- テスト時は `HATAGO_DEBUG_REDACTION=1` で詳細ログを確認
- ローカル開発では再接続制限を緩和してもOK

### 本番環境

- **必ず** `HATAGO_DEBUG_REDACTION` を無効にする
- 定期的にログを確認し、意図しない情報漏洩がないか確認
- `.hatago/secrets.json` は必ず `.gitignore` に追加

### 設定ファイル

```json
// .gitignore に追加
.hatago/secrets.json
.hatago/config.local.jsonc

// 環境変数での設定例
{
  "servers": [
    {
      "id": "secure-api",
      "type": "remote",
      "url": "https://api.example.com/mcp",
      "auth": {
        "type": "bearer",
        "token": "${HATAGO_API_TOKEN}" // 環境変数から読み込み（未実装）
      }
    }
  ]
}
```

## Security Features

### 実装済み

- ✅ 自動ログサニタイゼーション（noren ライブラリ）
- ✅ 無限再帰防止機構
- ✅ ヘルスチェックタイムアウト
- ✅ ポリシーゲート（ツール実行制御）
- ✅ HTTPS強制（本番環境）

### 計画中

- ⏳ シークレット暗号化（`.hatago/secrets.json`）
- ⏳ レート制限
- ⏳ ドメイン許可リスト

## Incident Response

もし機密情報がログに出力された場合：

1. **即座に** 該当のトークン/キーを無効化
2. 新しい認証情報を発行
3. ログファイルから該当部分を削除
4. GitHubにissueを報告（機密情報は含めない）

## Contributing

セキュリティ問題を発見した場合は、公開issueではなく、直接メンテナーにご連絡ください。

## References

- [noren ライブラリ](https://github.com/himorishige/noren) - PII保護ライブラリ
- [MCP Specification](https://modelcontextprotocol.io) - プロトコル仕様
