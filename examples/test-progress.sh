#!/bin/bash

# Hatago Hub Progress Notification Test Script
# Usage: ./test-progress.sh [server_url]

SERVER_URL=${1:-"http://localhost:3000"}
CLIENT_ID="cli-client-$(date +%s)"

echo "🚀 Hatago Hub Progress Notification Test"
echo "   Server: $SERVER_URL"
echo "   Client ID: $CLIENT_ID"
echo ""

# Function to connect to SSE
connect_sse() {
    echo "📡 Connecting to SSE endpoint..."
    curl -N -H "Accept: text/event-stream" \
         "$SERVER_URL/sse?clientId=$CLIENT_ID" &
    SSE_PID=$!
    echo "   SSE connection established (PID: $SSE_PID)"
    sleep 2
}

# Function to test progress
test_progress() {
    local duration=${1:-5000}
    echo ""
    echo "🧪 Testing progress notification (${duration}ms)..."
    
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -d "{\"clientId\": \"$CLIENT_ID\", \"duration\": $duration}" \
        "$SERVER_URL/demo/progress")
    
    echo "   Response: $response"
}

# Function to call a tool with progress
call_tool_with_progress() {
    local tool_name=$1
    local args=$2
    local progress_token="cli-progress-$(date +%s)"
    
    echo ""
    echo "🔧 Calling tool: $tool_name"
    echo "   Progress token: $progress_token"
    
    response=$(curl -s -X POST \
        -H "Content-Type: application/json" \
        -H "mcp-session-id: $CLIENT_ID" \
        -d "{
            \"name\": \"$tool_name\",
            \"arguments\": $args,
            \"progressToken\": \"$progress_token\"
        }" \
        "$SERVER_URL/tools/call")
    
    echo "   Response: $response"
}

# Main test flow
echo "=== Starting SSE Test ==="
connect_sse

echo ""
echo "=== Testing Progress Notifications ==="
test_progress 5000

echo ""
echo "=== Testing Long Progress ==="
test_progress 10000

echo ""
echo "=== Cleanup ==="
if [ ! -z "$SSE_PID" ]; then
    echo "   Stopping SSE connection..."
    kill $SSE_PID 2>/dev/null
fi

echo ""
echo "✅ Test completed!"