# MCP Inspector Tool Execution Issue

## 問題の経緯

1. MCP Inspectorでツールが"[object Object]"として表示される
2. ツール実行時に"Tool execution failed"エラーが発生
3. 3つのツールが検出されるが、registeredToolsは0のまま

## 根本原因

MCP SDKのMcpServerクラスの制限：

- 初期化時にtools/listハンドラーを設定
- 後からregisterTool()を呼ぶと"handler already exists"エラー
- 動的なツール登録に対応していない

## 解決策

低レベルのServer APIを使用：

```typescript
// McpServerの代わりにServerを使用
import { Server } from "@modelcontextprotocol/sdk/server/index.js";

// カスタムハンドラーを設定
server.setRequestHandler(ListToolsRequestSchema, async () => {
  // 動的にツールリストを返す
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // ツール呼び出しをプロキシ
});
```

## 修正済みの箇所

- RemoteMcpServer.discoverTools(): Tool[]を返すように修正済み
- refreshRemoteServerTools(): Toolオブジェクトを正しく処理するように修正済み

## 次のステップ

McpHubをMcpServerからServerに移行する必要がある
