# Hatago MCP Hub の技術解説：複数のMCPサーバーを統合管理する仕組み

## はじめに

Model Context Protocol (MCP) は、AIアシスタントと外部ツールやデータソースを接続するための標準化されたプロトコルです。しかし、複数のMCPサーバーを同時に利用しようとすると、以下のような課題に直面します：

- **ツール名の衝突**: 異なるサーバーが同じ名前のツールを提供する場合の競合
- **セッション管理**: 複数のクライアントからの独立したセッション維持
- **接続管理**: 各MCPサーバーとの接続状態の監視と復旧

Hatago MCP Hubは、これらの課題を解決し、複数のMCPサーバーを一つの統合されたインターフェースとして提供するハブサーバーです。本記事では、その実装の核心部分をコードレベルで解説します。

## 1. アーキテクチャ概要

### 1.1 全体構成

Hatago Hubは、以下の主要コンポーネントで構成されています：

```typescript
// packages/hub/src/hub.ts
export class HatagoHub {
  private sessions: SessionManager;        // セッション管理
  private toolRegistry: ToolRegistry;      // ツール名管理
  private toolInvoker: ToolInvoker;       // ツール実行
  private resourceRegistry: ResourceRegistry;  // リソース管理
  private promptRegistry: PromptRegistry;      // プロンプト管理
  private servers: Map<string, ServerInfo>;    // 接続サーバー情報
  private clients: Map<string, Client>;        // MCPクライアント接続
}
```

### 1.2 設計思想

Hatagoの設計では、以下の原則を重視しています：

1. **関数型プログラミングアプローチ**: 状態の変更を純粋関数で管理
2. **イミュータブルなデータ構造**: 予期しない副作用を防ぐ
3. **名前空間による衝突回避**: サーバーIDをプレフィックスとして使用
4. **セッション独立性**: 各クライアントが独立した状態を維持

## 2. ツール名衝突回避の仕組み

### 2.1 ToolRegistryの実装

複数のMCPサーバーが同じ名前のツールを提供する場合、名前の衝突が発生します。Hatagoはこれを「名前空間戦略」で解決します。

```typescript
// packages/runtime/src/registry/tool-registry-functional.ts

export interface ToolRegistryState {
  readonly tools: ReadonlyMap<string, ToolMetadata>;
  readonly serverTools: ReadonlyMap<string, ReadonlySet<string>>;
  readonly namingConfig: ToolNamingConfig;
}

export function generatePublicName(
  config: ToolNamingConfig,
  serverId: string,
  toolName: string,
): string {
  const strategy = config.strategy || 'namespace';
  
  // namespace戦略: サーバーIDをプレフィックスとして付与
  if (strategy === 'namespace') {
    const separator = config.separator || '_';
    const format = config.format || '{serverId}_{toolName}';
    
    let publicName = format
      .replace('{serverId}', serverId)
      .replace('{separator}', separator)
      .replace('{toolName}', toolName);
    
    // Claude Code互換性のため、ドットをアンダースコアに置換
    publicName = publicName.replace(/\./g, '_');
    
    return publicName;
  }
  
  // alias戦略: 可能な限り元の名前を保持
  if (strategy === 'alias') {
    return toolName;
  }
  
  // error戦略: 衝突時にエラーを発生
  if (strategy === 'error') {
    return toolName;
  }
}
```

### 2.2 ツール登録プロセス

新しいツールを登録する際の処理フローは以下のようになります：

```typescript
// packages/runtime/src/registry/tool-registry-functional.ts

export function addTool(
  state: ToolRegistryState,
  serverId: string,
  tool: Tool,
): ToolRegistryState {
  let publicName = generatePublicName(state.namingConfig, serverId, tool.name);
  
  // alias戦略の場合、衝突チェックとフォールバック
  if (state.namingConfig.strategy === 'alias') {
    const existing = state.tools.get(publicName);
    if (existing && existing.serverId !== serverId) {
      // 衝突検出、namespace戦略にフォールバック
      const separator = state.namingConfig.separator || '_';
      publicName = `${serverId}${separator}${tool.name}`.replace(/\./g, '_');
    }
  }
  
  // error戦略の場合、衝突時にエラー
  if (state.namingConfig.strategy === 'error') {
    const existing = state.tools.get(publicName);
    if (existing && existing.serverId !== serverId) {
      throw new Error(
        `Tool name collision: ${publicName} already exists from server ${existing.serverId}`,
      );
    }
  }
  
  // 新しいメタデータを作成
  const metadata: ToolMetadata = {
    serverId,
    originalName: tool.name,
    publicName,
    tool,
  };
  
  // イミュータブルな新しいMapを作成
  const newTools = new Map(state.tools);
  newTools.set(publicName, metadata);
  
  const serverToolSet = state.serverTools.get(serverId) || new Set<string>();
  const newServerToolSet = new Set(serverToolSet);
  newServerToolSet.add(publicName);
  
  const newServerTools = new Map(state.serverTools);
  newServerTools.set(serverId, newServerToolSet);
  
  return {
    ...state,
    tools: newTools,
    serverTools: newServerTools,
  };
}
```

### 2.3 実例：ツール名の変換

例えば、2つのMCPサーバーが両方とも `search` というツールを提供している場合：

- Server A の `search` → `serverA_search`
- Server B の `search` → `serverB_search`

このように、各ツールが一意の名前を持つことが保証されます。

## 3. ツール実行の仕組み

### 3.1 ToolInvokerの実装

ツールの実行は、ToolInvokerクラスが担当します。このクラスは、公開名から元のサーバーとツール名を解決し、適切なハンドラーを呼び出します。

```typescript
// packages/runtime/src/tool-invoker/invoker.ts

export class ToolInvoker {
  private handlers: Map<string, ToolHandler> = new Map();
  private toolRegistry: ToolRegistry;
  
  async callTool(
    _sessionId: string,
    toolName: string,
    args: any,
    options?: Partial<ToolInvokerOptions>,
  ): Promise<ToolCallResult> {
    const opts = { ...this.options, ...options };
    
    // ツール名に対応するハンドラーを取得
    const handler = this.handlers.get(toolName);
    
    if (!handler) {
      // レジストリでツールの存在を確認
      const tool = this.toolRegistry.getTool(toolName);
      
      if (!tool) {
        return {
          content: [{ type: 'text', text: `Tool not found: ${toolName}` }],
          isError: true,
        };
      }
      
      return {
        content: [{ type: 'text', text: `No handler registered for tool: ${toolName}` }],
        isError: true,
      };
    }
    
    try {
      // プログレストークンが提供されている場合、進捗ハンドラーを作成
      const progressHandler =
        options?.progressToken && this.sseManager
          ? (progress: number, total?: number, message?: string) => {
              this.sseManager?.sendProgress(options.progressToken!, {
                progressToken: options.progressToken,
                progress,
                total,
                message,
              });
            }
          : undefined;
      
      // タイムアウト付きで実行
      const result = await this.executeWithTimeout(
        () => handler(args, progressHandler),
        opts.timeout!,
      );
      
      // 結果のフォーマット
      if (typeof result === 'string') {
        return {
          content: [{ type: 'text', text: result }],
        };
      }
      
      // 既に正しいフォーマットの場合
      if (result && typeof result === 'object' && 'content' in result) {
        return result as ToolCallResult;
      }
      
      // その他のオブジェクトはJSONに変換
      return {
        content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Error calling tool ${toolName}: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }
}
```

### 3.2 ハンドラーの登録

各MCPサーバーのツールに対して、プロキシハンドラーが登録されます：

```typescript
// packages/hub/src/hub.ts (簡略化)

// サーバー接続時にツールハンドラーを登録
for (const tool of tools) {
  const publicName = this.toolRegistry.resolveTool(tool.name, serverId)?.publicName;
  
  this.toolInvoker.registerHandler(publicName, async (args) => {
    // MCPクライアントを通じて実際のサーバーにツール呼び出しを転送
    const client = this.clients.get(serverId);
    const result = await client.callTool({
      name: tool.name,  // 元のツール名を使用
      arguments: args,
    });
    return result;
  });
}
```

## 4. セッション管理

### 4.1 セッションの独立性

複数のAIクライアントが同時にHubを利用する場合、各クライアントは独立したセッションを維持する必要があります。

```typescript
// セッション管理の基本構造
class SessionManager {
  private sessions: Map<string, SessionData> = new Map();
  
  getOrCreateSession(sessionId: string): SessionData {
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        id: sessionId,
        createdAt: Date.now(),
        lastAccessedAt: Date.now(),
        context: {},
      });
    }
    
    const session = this.sessions.get(sessionId)!;
    session.lastAccessedAt = Date.now();
    return session;
  }
}
```

### 4.2 リクエスト処理フロー

JSON-RPCリクエストの処理では、セッションIDを基にコンテキストを管理します：

```typescript
// packages/hub/src/hub.ts

public async handleJsonRpcRequest(
  body: any,
  sessionId?: string,
): Promise<any> {
  const { method, params, id } = body;
  
  try {
    switch (method) {
      case 'initialize':
        // クライアントの機能を保存
        this.capabilityRegistry.setClientCapabilities(
          sessionId || 'default',
          params.capabilities,
        );
        
        return {
          jsonrpc: '2.0',
          id,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {
              tools: {},
              resources: {},
              prompts: {},
            },
            serverInfo: {
              name: 'hatago-hub',
              version: '0.1.0',
            },
          },
        };
      
      case 'tools/list':
        // ツールリストの取得
        return {
          jsonrpc: '2.0',
          id,
          result: {
            tools: this.tools.list(),
            _meta: {
              toolset_hash: this.toolsetHash,
              revision: this.toolsetRevision,
            },
          },
        };
      
      case 'tools/call': {
        const { name, arguments: args } = params;
        
        // セッションIDを使用してツールを実行
        const result = await this.toolInvoker.callTool(
          sessionId || 'default',
          name,
          args,
        );
        
        return {
          jsonrpc: '2.0',
          id,
          result,
        };
      }
    }
  } catch (error) {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
```

## 5. 動的更新と通知

### 5.1 ツールセットの変更通知

MCPサーバーの追加・削除時に、クライアントに変更を通知する仕組み：

```typescript
// packages/hub/src/hub.ts

private async sendToolListChangedNotification(): Promise<void> {
  // ツールセットのハッシュを計算
  const newHash = await this.calculateToolsetHash();
  
  if (this.toolsetHash !== newHash) {
    this.toolsetHash = newHash;
    this.toolsetRevision++;
    
    // 全クライアントに通知を送信
    const notification = {
      jsonrpc: '2.0',
      method: 'notifications/tools/list_changed',
      params: {
        _meta: {
          toolset_hash: this.toolsetHash,
          revision: this.toolsetRevision,
        },
      },
    };
    
    // StreamableHTTP経由で通知
    if (this.streamableTransport) {
      this.streamableTransport.notify(notification);
    }
    
    // SSE経由で通知
    if (this.sseManager) {
      this.sseManager.broadcast(notification);
    }
  }
}

private async calculateToolsetHash(): Promise<string> {
  const tools = this.toolRegistry.getAllTools();
  const toolNames = tools.map(t => t.name).sort();
  
  // 簡易的なハッシュ計算
  const data = JSON.stringify(toolNames);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  return hash.substring(0, 8);
}
```

## 6. エラーハンドリングと復旧

### 6.1 サーバー接続の自動復旧

MCPサーバーとの接続が切断された場合の自動再接続機能：

```typescript
// packages/hub/src/hub.ts (簡略化)

private async connectWithRetry(
  id: string,
  spec: ServerSpec,
  maxRetries: number = 3,
): Promise<void> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await this.connectServer(id, spec);
      
      // 成功したらツールを再登録
      const server = this.servers.get(id)!;
      this.toolRegistry.registerServerTools(id, server.tools);
      
      // ハンドラーを再登録
      for (const tool of server.tools) {
        const metadata = this.toolRegistry.resolveTool(tool.name, id);
        if (metadata) {
          this.registerToolHandler(metadata.publicName, id, tool.name);
        }
      }
      
      this.logger.info(`Server ${id} reconnected successfully`);
      return;
    } catch (error) {
      lastError = error as Error;
      this.logger.warn(
        `Connection attempt ${attempt}/${maxRetries} failed for server ${id}`,
        { error: lastError.message },
      );
      
      if (attempt < maxRetries) {
        // 指数バックオフで待機
        const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  // 全ての再試行が失敗
  const server = this.servers.get(id)!;
  server.status = 'error';
  server.error = lastError;
  
  throw lastError;
}
```

## 7. 実装のポイント

### 7.1 関数型プログラミングアプローチの利点

Hatagoの実装では、状態管理に関数型プログラミングのアプローチを採用しています：

```typescript
// 純粋関数による状態更新
export function registerServerTools(
  state: ToolRegistryState,
  serverId: string,
  tools: Tool[],
): ToolRegistryState {
  // 既存のツールをクリア（新しい状態を作成）
  let newState = clearServerTools(state, serverId);
  
  // 各ツールを追加（イミュータブルな更新）
  for (const tool of tools) {
    newState = addTool(newState, serverId, tool);
  }
  
  return newState;
}
```

**利点：**
- **予測可能性**: 純粋関数により、同じ入力は常に同じ出力を生成
- **テスタビリティ**: 副作用がないため、単体テストが容易
- **並行性**: イミュータブルなデータ構造により、競合状態を防ぐ

### 7.2 型安全性の確保

TypeScriptの型システムを活用して、コンパイル時の安全性を確保：

```typescript
export interface ToolMetadata {
  serverId: string;           // ツールを提供するサーバーID
  originalName: string;       // 元のツール名
  publicName: string;         // 公開名（衝突回避後）
  tool: Tool;                // MCPツール定義
}

export interface ToolRegistryState {
  readonly tools: ReadonlyMap<string, ToolMetadata>;
  readonly serverTools: ReadonlyMap<string, ReadonlySet<string>>;
  readonly namingConfig: ToolNamingConfig;
}
```

### 7.3 パフォーマンス最適化

- **Map/Setの使用**: O(1)のルックアップ性能
- **遅延評価**: 必要になるまでハッシュ計算を遅延
- **バッチ処理**: 複数の変更を一度に処理

## まとめ

Hatago MCP Hubは、以下の技術的アプローチにより、複数のMCPサーバーを効率的に統合管理しています：

1. **名前空間戦略によるツール名衝突の回避**
   - サーバーIDをプレフィックスとして使用
   - 柔軟な命名戦略（namespace/alias/error）

2. **関数型プログラミングによる堅牢な状態管理**
   - イミュータブルなデータ構造
   - 純粋関数による予測可能な状態更新

3. **セッション独立性の確保**
   - クライアントごとの独立したコンテキスト
   - セッションベースのリクエスト処理

4. **動的な更新と通知**
   - ツールセットの変更通知
   - ホットリロード対応

5. **自動復旧機能**
   - 接続エラー時の自動再接続
   - 指数バックオフによる再試行

これらの仕組みにより、Hatagoは複数のMCPサーバーを透過的に統合し、クライアントに対して一つの統一されたインターフェースを提供することができます。この設計は、マイクロサービスアーキテクチャにおけるAPI Gatewayパターンに類似しており、MCPエコシステムにおいて重要な役割を果たしています。

## 参考リンク

- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [Hatago Hub GitHub Repository](https://github.com/himorishige/hatago-hub)