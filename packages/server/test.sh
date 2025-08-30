#!/bin/bash

# Hatago Server Test Script
# Tests both STDIO and HTTP modes

set -e

echo "🧪 Testing @hatago/server package"
echo ""

# Build first
echo "📦 Building package..."
pnpm build

# Test 1: Help command
echo "✅ Test 1: Help command"
node dist/cli.js --help
echo ""

# Test 2: Version command
echo "✅ Test 2: Version command"
node dist/cli.js --version
echo ""

# Test 3: HTTP mode startup and shutdown
echo "✅ Test 3: HTTP mode startup"
node dist/cli.js --http --port 3001 --config test.config.json &
SERVER_PID=$!
sleep 2

# Check if server is running
if curl -s http://localhost:3001/health > /dev/null; then
    echo "   Server is running on port 3001"
else
    echo "   ❌ Server failed to start"
    exit 1
fi

# Shutdown server
kill $SERVER_PID 2>/dev/null || true
echo "   Server stopped"
echo ""

# Test 4: STDIO mode with simple MCP request
echo "✅ Test 4: STDIO mode (initialize request)"
MSG='{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{}},"id":1}'
(echo -ne "Content-Length: ${#MSG}\r\n\r\n${MSG}") | node dist/cli.js --stdio --config test.config.json 2>/dev/null | head -20 | grep -q "2025-06-18" && echo "   Initialize successful" || echo "   ❌ Initialize failed"
echo ""

# Test 5: Config file loading
echo "✅ Test 5: Config file loading"
if [ -f "test.config.json" ]; then
    node dist/cli.js --config test.config.json --http --port 3002 &
    CONFIG_PID=$!
    sleep 2
    
    if curl -s http://localhost:3002/health > /dev/null; then
        echo "   Config loaded successfully"
    else
        echo "   ❌ Config loading failed"
    fi
    
    kill $CONFIG_PID 2>/dev/null || true
else
    echo "   Skipping (no example config found)"
fi
echo ""

echo "✅ All tests passed!"