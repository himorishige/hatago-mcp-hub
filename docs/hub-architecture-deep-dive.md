## Hatago MCP Hubの心臓部：複数MCPサーバーを統合するルーティング技術解説

### はじめに

Hatago MCP Hubは、複数のModel Context Protocol (MCP)サーバーを単一のエンドポイントに統合し、AI開発ツールからのアクセスを容易にするためのハブサーバーです。その中核をなすのは、異なるMCPサーバーが提供するツールをインテリジェントに束ね、リクエストに応じて適切なサーバーに振り分ける（ルーティングする）仕組みです。

この資料では、サーバーフレームワーク（Hono）やCLIといった周辺技術の詳細には触れず、Hatagoがどのようにしてこの「ハブ機能」を実現しているのか、その設計思想とコードレベルのロジックに焦点を当てて解説します。

### 1. 中核となる設計思想：抽象化と委譲

Hatago Hubの設計は、2つの重要な概念に基づいています。

1.  **サーバーの抽象化 (`McpServer`)**: 接続される個々のMCPサーバー（ローカル、リモート、HTTP、STDIOなど）は、すべて `McpServer` という一貫したインターフェースを持つオブジェクトとして抽象化されます。Hubは、接続先のサーバーがどのようなプロトコルで通信しているかを意識する必要がありません。
2.  **リクエストの委譲 (`HatagoHub`)**: Hub自身はツールの実行ロジックを持ちません。その役割は、クライアントからのMCPリクエストを受け取り、リクエストが要求しているツール（`tool_choice`）を提供している `McpServer` を特定し、そのリクエストを該当サーバーに"委譲"することです。

この設計により、Hubは純粋な「ルーター」および「プロキシ」として機能し、責務が明確に分離され、高い拡張性と保守性を実現しています。

### 2. 主要なコンポーネントとロジック

このハブ機能は、主に `packages/hub/src/` 内のコード、特に `mcp-server/`, `hub.ts`, `hub-streamable.ts` によって実現されています。

#### 2.1. `McpServer`: 個別サーバーのラッパー

すべての処理は、個々のMCPサーバーを管理する `McpServer` クラス（またはその概念）から始まります。これは、`packages/hub/src/mcp-server/` ディレクトリ内のロジックに相当します。

このクラスは、以下のような役割を担います。

- **設定の保持**: サーバーの名前、エンドポイントURL、トランスポートの種類（HTTP, STDIOなど）といった構成情報を保持します。
- **ツール定義の取得**: 起動時や必要に応じて、管理対象のMCPサーバーに `GET /mcp/tools` リクエストを送信し、そのサーバーが提供するツール定義（`ToolDefinition[]`）を取得・キャッシュします。
- **リクエストの実行**: Hubから委譲されたMCPリクエストを、実際に管理対象のサーバーに送信し、レスポンス（ストリーム）を返却します。

```typescript
// 概念的なMcpServerの構造 (pseudo-code)
class McpServer {
  private tools: ToolDefinition[];
  private serverConfig: McpServerConfig;

  constructor(config: McpServerConfig) {
    this.serverConfig = config;
  }

  // サーバーからツール定義を取得する
  async initialize(): Promise<void> {
    // this.serverConfig.endpoint にリクエストを送り、ツール定義を取得
    this.tools = await this.fetchToolsFromServer();
  }

  // このサーバーが提供するツール定義を返す
  getTools(): ToolDefinition[] {
    return this.tools;
  }

  // 指定されたツールがこのサーバーに存在するか確認
  hasTool(toolName: string): boolean {
    return this.tools.some((tool) => tool.function.name === toolName);
  }

  // MCPリクエストを処理し、レスポンスストリームを返す
  handleRequest(request: McpRequest): ReadableStream<McpResponse> {
    // this.serverConfig.endpoint に POST /mcp/run リクエストを送信
    // レスポンスのストリームをそのまま返す
    return this.proxyRequestToServer(request);
  }
}
```

#### 2.2. `HatagoHub`: サーバー群のオーケストレーター

`HatagoHub` クラス（`packages/hub/src/hub.ts`）は、複数の `McpServer` インスタンスを管理するオーケストレーターです。

主な役割は以下の通りです。

- **`McpServer` の管理**: 設定ファイル（`hatago.config.json`）に基づき、複数の `McpServer` インスタンスを生成し、配列として保持します。
- **全ツールの集約**: 保持しているすべての `McpServer` インスタンスからツール定義を収集し、単一の巨大なツールリストとしてクライアントに提供します。これにより、クライアントからはあたかも単一のサーバーが多数のツールを提供しているように見えます。
- **リクエストのルーティング**: これがHubの最も重要な機能です。クライアントから `POST /mcp/run` リクエストを受け取ると、リクエストボディ内の `tool_choice.function.name` を見て、そのツール名を持つ `McpServer` を探し出します。そして、その `McpServer` の `handleRequest` メソッドを呼び出して処理を委譲します。

以下は、`hub.ts` 内のロジックを簡略化したものです。

```typescript
// packages/hub/src/hub.ts の概念的な実装 (pseudo-code)
import { McpServer } from "./mcp-server";

class HatagoHub {
  private servers: McpServer[];

  constructor(configs: McpServerConfig[]) {
    // 設定からMcpServerインスタンスを複数生成
    this.servers = configs.map((config) => new McpServer(config));
  }

  // すべてのサーバーを初期化
  async initialize(): Promise<void> {
    await Promise.all(this.servers.map((server) => server.initialize()));
  }

  // すべてのサーバーからツールを集約して返す
  getAllTools(): ToolDefinition[] {
    return this.servers.flatMap((server) => server.getTools());
  }

  // MCPリクエストを適切なサーバーにルーティングする
  handleRequest(request: McpRequest): ReadableStream<McpResponse> {
    const toolName = request.tool_choice?.function?.name;
    if (!toolName) {
      throw new Error("tool_choice is missing in the request.");
    }

    // toolNameを提供しているサーバーを探す
    const targetServer = this.servers.find((server) =>
      server.hasTool(toolName),
    );

    if (!targetServer) {
      throw new Error(`Tool "${toolName}" not found in any configured server.`);
    }

    // 見つけたサーバーにリクエストを委譲（プロキシ）
    console.log(`Routing tool "${toolName}" to server: ${targetServer.name}`);
    return targetServer.handleRequest(request);
  }
}
```

#### 2.3. ストリーム処理 (`hub-streamable.ts`)

MCPでは、思考プロセスやツールの部分的な結果をリアルタイムにクライアントに送るため、レスポンスはストリーミング形式（`application/json-seq`）となります。

Hatago Hubは、このストリーミングを途切れさせることなく中継する必要があります。`packages/hub/src/hub-streamable.ts` はこの責務を担います。

`HatagoHub` が `targetServer.handleRequest(request)` を呼び出すと、`McpServer` は下流のMCPサーバーへのリクエストを開始し、そのレスポンスボディである `ReadableStream` をそのまま返します。`HatagoHub` は、この受け取ったストリームを一切加工せず、そのままクライアントへのレスポンスとして返却します。

これにより、Hubはレスポンスの内容を完全に解釈することなく、効率的にデータを中継するパイプラインとして機能します。

### 3. `typescript-sdk` の活用方法

Hatago Hubの実装は、公式の `modelcontextprotocol/typescript-sdk` に大きく依存しています。このSDKの活用法は、Hatagoの信頼性とプロトコル準拠性を担保する上で不可欠です。

1.  **型の利用によるコンプライアンス保証**:
    SDKは `McpRequest`, `McpResponse`, `ToolDefinition` といった、MCPで通信されるすべてのデータ構造のTypeScript型を定義しています。Hatagoはこれらの型を全面的に採用しています。

    ```typescript
    import type {
      McpRequest,
      McpResponse,
      ToolDefinition,
    } from "@model-context/core";
    ```

    これにより、`HatagoHub` が送受信するデータが常にMCPの仕様に準拠していることがコンパイル時に保証されます。例えば、`handleRequest` メソッドの引数が `McpRequest` 型であるため、不正な形式のリクエストを受け付けません。

2.  **プロトコルの解釈**:
    SDKのソースコード、特に型定義は、MCPというプロトコルの仕様書そのものです。Hatagoの開発では、SDKの型定義を読むことで、「`tool_choice` はどのような構造か」「レスポンスの各チャンク（`McpResponse`）には何が含まれるべきか」といったプロトコルの詳細を正確に理解し、実装に反映させています。

3.  **再発明の回避**:
    SDKが提供する型やユーティリティを利用することで、プロトコルの基本的なデータ構造を自前で定義する必要がなくなり、開発者はHubのコアロジックである「ルーティング」や「サーバー管理」に集中できます。

要するに、`typescript-sdk` は、HatagoがMCPという共通言語を正しく話すための「辞書」であり「文法書」として機能しているのです。

### まとめ

Hatago MCP Hubの核心は、個々のMCPサーバーを `McpServer` として抽象化し、`HatagoHub` がオーケストレーター兼ルーターとして機能する点にあります。クライアントからのリクエストを見て、どの `McpServer` が担当すべきかを判断し、処理を委譲する。このシンプルな「委譲モデル」により、複雑なプロトコルを扱うシステムでありながら、クリーンで拡張性の高いアーキテクチャを実現しています。

そして、そのすべての土台には `typescript-sdk` による厳密な型定義があり、プロトコルへの準拠を強力にサポートしています。この仕組みこそが、Hatagoを安定かつ信頼性の高いMCPハブたらしめているのです。
