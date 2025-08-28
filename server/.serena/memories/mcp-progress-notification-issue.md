# MCP Progress Notification Issue

## 問題
- Workers版でprogress notificationをSSE経由で送信しているが、MCP Inspectorで受け取れていない
- Node.js版のHatagoでは正常に動作していた

## 調査結果

### MCP仕様に基づく正しいフォーマット
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/progress",
  "params": {
    "progressToken": "abc123",
    "progress": 50,
    "total": 100,  // optional
    "message": "Processing..."  // optional
  }
}
```

### SSE経由での送信方法
- SSEイベントとして`data: `プレフィックスを付けてJSON文字列を送信
- 各イベントは2つの改行で区切る

### 現在の実装の違い

#### Node.js版（動作している）
- StreamableHTTPTransportの`sendProgressNotification`メソッドを使用
- transportが適切にSSEストリームを管理

#### Workers版（動作していない）  
- 直接`stream.writeSSE`でprogress notificationを送信
- SSEフォーマットは正しいが、MCP Inspectorが受け取れていない

## 考えられる原因
1. MCP InspectorがprogressTokenを送信していない
2. SSEイベントタイプの問題（`event:`フィールドが必要？）
3. タイミングの問題（レスポンス前にprogressを送りすぎ？）

## 次のステップ
- MCP InspectorからのリクエストにprogressTokenが含まれているか確認
- SSEイベントフォーマットを調整（event typeを追加）
- Node.js版の実装により近づける