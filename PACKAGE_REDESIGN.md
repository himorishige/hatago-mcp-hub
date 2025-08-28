# Hatago パッケージ再設計ドキュメント

## 概要

2024-08-28実施。モノレポ化したパッケージの問題点を解決し、ユーザーフレンドリーなAPIを提供するための再設計。

## 設計方針

フェルン（GPT-5）の提案に基づき、**構成（composition）ベース**の設計を採用：
- 内部は責務分離された小さなコンポーネント
- ユーザーには簡潔なファサードAPI
- 継承は任意の糖衣として提供（メインではない）

## パッケージ構成

### 1. @hatago/core (v0.1.0)
**責務**: 型定義とインターフェース

**主要エクスポート**:
```typescript
// MCP SDK types (re-exported)
export type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';

// Metadata types
export type { ToolMetadata, ResourceMetadata, PromptMetadata }
export type { Session }
export type { ConnectionType, McpConnection }
```

### 2. @hatago/runtime (v0.1.0)
**責務**: コア実行時コンポーネント

**主要クラス**:
- `SessionManager`: セッション管理
  - 新規追加: `list()`, `create()`, `destroy()`
- `ToolRegistry`: ツール登録管理（純粋な登録のみ）
- `ResourceRegistry`: リソース登録管理
- `PromptRegistry`: プロンプト登録管理
- `ToolInvoker`: ツール実行（新規追加）
  - `callTool()`: ツールの実行
  - `registerHandler()`: ハンドラー登録
- `McpRouter`: ルーティング

**設計変更**:
- Registryから実行機能を分離（ToolInvoker新設）
- SessionManagerにエイリアスメソッド追加

### 3. @hatago/transport (v0.1.0) - 新規
**責務**: トランスポート層の抽象化

**インターフェース**:
```typescript
interface ITransport {
  send(message: any): Promise<void>;
  onMessage(handler: (message: any) => void): void;
  onError(handler: (error: Error) => void): void;
  start(): Promise<void>;
  close(): Promise<void>;
  ready(): Promise<boolean>;
}
```

**実装**:
- `ProcessTransport`: Node.js stdio通信
- Re-export: `StdioClientTransport`, `SSEClientTransport` (MCP SDK)

### 4. @hatago/hub (v0.1.0) - 新規
**責務**: ユーザー向けファサードAPI

**メインAPI**:
```typescript
// 関数ベースのエントリーポイント
export function createHub(options?: HubOptions): HatagoHub

// 簡潔なツール/リソースAPI
class HatagoHub {
  tools: {
    list(options?: ListOptions): Tool[]
    call(name: string, args: any, options?: CallOptions): Promise<any>
  }
  
  resources: {
    list(options?: ListOptions): Resource[]
    read(uri: string, options?: ReadOptions): Promise<any>
  }
  
  // サーバー管理
  addServer(id: string, spec: ServerSpec): this
  start(): Promise<this>
  stop(): Promise<void>
  
  // イベント
  on(event: HubEvent, handler: HubEventHandler): void
}
```

**ヘルパー関数**:
- `cliServer()`: CLIサーバー設定の作成
- `httpServer()`: HTTPサーバー設定の作成
- `sseServer()`: SSEサーバー設定の作成

## 使用例

### Before (200行以上)
```typescript
// 多数のimport
import { SessionManager, ToolRegistry, ResourceRegistry... } from '@hatago/runtime';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

// 手動で各コンポーネントを初期化
const sessions = new SessionManager();
const tools = new ToolRegistry();
const resources = createResourceRegistry();

// 手動でMCPサーバーに接続
const transport = new StdioClientTransport({...});
const client = new Client({...});
await client.connect(transport);

// 手動でinitialize
await client.request({method: 'initialize', ...});

// 手動でツール登録
const toolsResult = await client.request({method: 'tools/list'});
for (const tool of toolsResult.tools) {
  tools.register(tool);
  // ハンドラーも手動登録...
}

// リクエストハンドラーを個別設定
mcpServer.setRequestHandler(ListToolsRequestSchema, ...);
mcpServer.setRequestHandler(CallToolRequestSchema, ...);
// ...など多数
```

### After (20行程度)
```typescript
import { createHub } from '@hatago/hub';
import { Hono } from 'hono';

async function main() {
  // Hub作成（内部で全て自動化）
  const hub = await createHub({ 
    configFile: './hatago-test.config.json' 
  })
    .addServer('example', {
      command: 'npx',
      args: ['@modelcontextprotocol/server-everything']
    })
    .start();
  
  // ツール呼び出し（qualified name使用）
  const result = await hub.tools.call('example/sum', { a: 1, b: 2 });
  
  // Honoアプリ（Hubが処理を自動化）
  const app = new Hono();
  app.post('/mcp', c => hub.handleHttpRequest(c.req));
  
  serve({ fetch: app.fetch, port: 8787 });
}
```

## 実装の詳細

### 責務分離
- **Registry**: 純粋な登録・取得のみ
- **Invoker**: 実行ロジック
- **Hub**: 統合ファサード
- **Transport**: 通信層の抽象化

### 命名戦略
- Qualified name: `serverId/toolName`
- 内部では`serverId_toolName`に変換（Claude Code互換）
- ユニークな場合は`toolName`単独も許可

### イベントシステム
```typescript
hub.on('server:connected', ({ serverId }) => {});
hub.on('tool:registered', ({ serverId, tool }) => {});
hub.on('tool:called', ({ name, args, result }) => {});
```

## 利点

1. **ユーザー記述量**: 90%削減（200行→20行）
2. **責務分離**: 各コンポーネントが独立して拡張可能
3. **TypeScript/JavaScript両対応**: 関数ベースAPI
4. **段階的移行**: 既存コードを壊さない
5. **拡張性**: プラグイン、イベント、カスタムトランスポート

## 今後の拡張可能性

- `@hatago/preset-node`: Node.js環境最適化
- `@hatago/preset-cloudflare`: Workers環境最適化
- `@hatago/config`: 設定ファイルローダー
- プラグインシステム
- メトリクス/監視
- 権限制御

## 変更履歴

- 2024-08-28: 初版作成
  - SessionManagerにlist/create/destroyメソッド追加
  - ToolInvokerクラス新設
  - @hatago/transportパッケージ作成
  - @hatago/hubパッケージ作成