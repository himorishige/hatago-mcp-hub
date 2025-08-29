#!/bin/bash

# Simple MCP Hub Test Script
# Usage: ./test-mcp-simple.sh [server_url]

SERVER_URL=${1:-"http://localhost:3000"}
SESSION_ID="test-session-$(date +%s)"

echo "🚀 Hatago Hub MCP Protocol Test"
echo "   Server: $SERVER_URL"
echo "   Session ID: $SESSION_ID"
echo ""

# Function to make MCP request
mcp_request() {
    local method=$1
    local params=$2
    local id=${3:-1}
    
    curl -s -X POST "$SERVER_URL/mcp" \
        -H "Content-Type: application/json" \
        -H "mcp-session-id: $SESSION_ID" \
        -d "{
            \"jsonrpc\": \"2.0\",
            \"method\": \"$method\",
            \"params\": $params,
            \"id\": $id
        }"
}

# Initialize
echo "=== Initialize ==="
response=$(mcp_request "initialize" '{"protocolVersion":"2024-11-05","capabilities":{}}' 1)
echo "Response: $response"
echo ""

# List tools
echo "=== List Tools ==="
response=$(mcp_request "tools/list" '{}' 2)
echo "Response: $response" | jq -r '.result.tools[] | "- \(.name): \(.description // "No description")"' 2>/dev/null || echo "$response"
echo ""

# List resources (if supported)
echo "=== List Resources ==="
response=$(mcp_request "resources/list" '{}' 3)
echo "Response: $response" | jq -r '.result.resources[] | "- \(.uri): \(.name)"' 2>/dev/null || echo "$response"
echo ""

# Test SSE connection
echo "=== Test SSE Endpoint ==="
echo "Connecting to SSE..."
timeout 3 curl -N -H "Accept: text/event-stream" \
    "$SERVER_URL/sse?clientId=$SESSION_ID" 2>/dev/null | head -5
echo ""

# Health check
echo "=== Health Check ==="
curl -s "$SERVER_URL/health" | jq '.' 2>/dev/null || curl -s "$SERVER_URL/health"
echo ""

echo "✅ Test completed!"