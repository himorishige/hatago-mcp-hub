#!/bin/bash

# Hatago Lite Build Script
# Alternative build script when tsdown hangs

echo "🏨 Building Hatago Lite..."

# Clean dist directory
rm -rf dist
mkdir -p dist

# Compile TypeScript
echo "📦 Compiling TypeScript..."
npx tsc --outDir dist --module esnext --target es2022 --declaration

# Copy package.json and other files
cp package.json dist/
cp README.md dist/

# Make CLI executable
chmod +x dist/cli/index.js
chmod +x dist/cli/index-lite.js

echo "✅ Build complete!"
echo "📁 Output in dist/"