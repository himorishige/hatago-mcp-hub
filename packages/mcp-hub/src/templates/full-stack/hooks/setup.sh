#!/bin/bash

# Full-Stack Template Setup Script
# This script runs after template initialization

set -e

echo "🚀 Setting up Hatago Full-Stack environment..."

# Check for required tools
check_command() {
  if ! command -v $1 &> /dev/null; then
    echo "⚠️  $1 is not installed. Please install it to use all features."
    return 1
  fi
  return 0
}

echo "📋 Checking dependencies..."
check_command git
check_command node
check_command npm

# Create necessary directories
echo "📁 Creating project directories..."
mkdir -p .hatago/{logs,cache,temp}
mkdir -p scripts
mkdir -p docs

# Create health check script
cat > scripts/health-check.sh << 'EOF'
#!/bin/bash
echo "🏥 Running Hatago health checks..."

# Test configuration
if [ -f hatago.config.json ]; then
  echo "✅ Configuration file found"
else
  echo "❌ Configuration file missing"
  exit 1
fi

# Test environment variables
if [ -n "$GITHUB_TOKEN" ]; then
  echo "✅ GitHub token configured"
else
  echo "⚠️  GitHub token not set"
fi

if [ -n "$DATABASE_URL" ]; then
  echo "✅ Database URL configured"
else
  echo "⚠️  Database URL not set"
fi

# Test Hatago
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | hatago serve --stdio > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ Hatago server responsive"
else
  echo "❌ Hatago server not responding"
fi

echo "🎉 Health check complete!"
EOF

chmod +x scripts/health-check.sh

# Create example Makefile
cat > Makefile << 'EOF'
.PHONY: help install dev test build deploy clean

help:
	@echo "Available commands:"
	@echo "  make install  - Install dependencies"
	@echo "  make dev      - Start development server"
	@echo "  make test     - Run tests"
	@echo "  make build    - Build for production"
	@echo "  make deploy   - Deploy to production"
	@echo "  make clean    - Clean build artifacts"

install:
	npm install -g @himorishige/hatago-mcp-hub
	npm install

dev:
	hatago serve --stdio --watch --verbose

test:
	./scripts/health-check.sh

build:
	@echo "Building production configuration..."
	@cp hatago.config.json hatago.config.production.json

deploy:
	@echo "Deploying to production..."
	@echo "Configure your deployment strategy here"

clean:
	rm -rf .hatago/cache/*
	rm -rf .hatago/temp/*
EOF

# Create docker-compose.yml
cat > docker-compose.yml << 'EOF'
version: '3.8'

services:
  hatago:
    image: node:20-slim
    working_dir: /app
    volumes:
      - .:/app
      - /app/node_modules
    environment:
      - DATABASE_URL=${DATABASE_URL}
      - GITHUB_TOKEN=${GITHUB_TOKEN}
      - NODE_ENV=development
    ports:
      - "3535:3535"
    command: npx hatago serve --http --host 0.0.0.0

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=hatago
      - POSTGRES_PASSWORD=hatago
      - POSTGRES_DB=hatago_dev
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

volumes:
  postgres_data:
EOF

# Setup git hooks (optional)
if [ -d .git ]; then
  echo "📝 Setting up git hooks..."
  mkdir -p .git/hooks
  cat > .git/hooks/pre-commit << 'EOF'
#!/bin/bash
# Run health check before commit
./scripts/health-check.sh
EOF
  chmod +x .git/hooks/pre-commit
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Copy .env.hatago.example to .env and configure your credentials"
echo "2. Run 'make dev' to start the development server"
echo "3. Run './scripts/health-check.sh' to verify your setup"
echo ""
echo "For Docker setup:"
echo "  docker-compose up -d"
echo ""
echo "Happy coding! 🎉"