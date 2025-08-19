# コードスタイルと規約

## TypeScript設定
- **ターゲット**: ESNext
- **モジュール**: ESNext (ESM)
- **厳密モード**: strict: true
- **JSX**: Hono JSX (react-jsx with hono/jsx)
- **宣言ファイル**: 自動生成

## Biome設定
- **インデント**: スペース2つ
- **引用符**: シングルクォート（'）
- **セミコロン**: 必須（Biome推奨ルール）
- **import整理**: 自動

## コーディング規約
- **命名規則**:
  - ファイル名: kebab-case
  - クラス名: PascalCase
  - 関数・変数: camelCase
  - 定数: UPPER_SNAKE_CASE
  
- **ファイル構造**:
  - 1ファイル1機能
  - index.tsはエントリーポイントのみ
  - 型定義は `.types.ts` サフィックス

- **import順序**（Biome自動整理）:
  1. Node.js組み込みモジュール
  2. 外部パッケージ
  3. 内部モジュール

## Hono特有の規約
- ルーティングはapp.get(), app.post()などを使用
- コンテキスト（c）を活用したレスポンス処理
- ミドルウェアはapp.use()で登録

## MCP関連の規約
- MCPツール名: snake_case（MCP仕様準拠）
- セッション管理: mcp-session-idヘッダー使用
- エラーレスポンス: JSON-RPC 2.0形式

## テスト規約
- テストファイル: `*.test.ts`
- src/配下に配置
- Vitest使用