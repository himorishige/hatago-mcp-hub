# Hatago Full-Stack Template

Production-ready setup with comprehensive MCP servers for enterprise applications.

## 🚀 Quick Start

```bash
# 1. Configure environment (REQUIRED)
cp .env.hatago.example .env
# Edit .env with your credentials

# 2. Run setup script (optional)
./hooks/setup.sh

# 3. Start Hatago with monitoring
hatago serve --stdio --watch --verbose

# 4. Verify all services
./scripts/health-check.sh
```

## 📦 Complete MCP Stack

### Core Services

| Server         | Description         | Required | Tags        |
| -------------- | ------------------- | -------- | ----------- |
| **filesystem** | File operations     | ✅       | core, local |
| **git**        | Version control     | ✅       | core, local |
| **github**     | GitHub integration  | ✅       | core, cloud |
| **postgres**   | Database operations | ✅       | database    |

### Productivity Tools

| Server       | Description         | Required | Tags          |
| ------------ | ------------------- | -------- | ------------- |
| **search**   | Codebase search     | ✅       | productivity  |
| **browser**  | Web scraping        | ✅       | tools         |
| **memory**   | Context persistence | ✅       | ai            |
| **deepwiki** | Documentation       | ✅       | documentation |

### Optional Services

| Server         | Description     | Required    | Tags          |
| -------------- | --------------- | ----------- | ------------- |
| **openai**     | AI capabilities | ⚠️ API Key  | ai            |
| **slack**      | Notifications   | ⚠️ Webhook  | notifications |
| **monitoring** | Metrics & logs  | Recommended | observability |

## 🔧 Production Configuration

### Database Setup

```bash
# PostgreSQL setup
createdb myapp_development
createdb myapp_test
createdb myapp_production

# Run migrations (if applicable)
npm run db:migrate
```

### Security Hardening

```json
{
  "timeouts": {
    "connectMs": 5000,
    "requestMs": 30000,
    "keepAliveMs": 20000
  },
  "mcpServers": {
    "postgres": {
      "env": {
        "DATABASE_URL": "${DATABASE_URL}",
        "SSL_MODE": "require"
      }
    }
  }
}
```

### Monitoring Setup

```bash
# Enable all monitoring features
hatago serve --tags monitoring,observability

# Custom metrics endpoint
curl http://localhost:3535/metrics
```

## 🏗️ Architecture Patterns

### Microservices Communication

```javascript
// Use different tags for service isolation
const services = {
  api: ['core', 'database', 'github'],
  worker: ['database', 'ai', 'notifications'],
  frontend: ['filesystem', 'search', 'browser']
};
```

### Load Balancing

```nginx
upstream hatago_servers {
  server 127.0.0.1:3535;
  server 127.0.0.1:3536;
  server 127.0.0.1:3537;
}
```

### Caching Strategy

```json
{
  "mcpServers": {
    "redis": {
      "command": "mcp-server-redis",
      "env": { "REDIS_URL": "${REDIS_URL}" },
      "tags": ["cache", "performance"]
    }
  }
}
```

## 🚢 Deployment

### Docker Compose

```yaml
version: '3.8'
services:
  hatago:
    image: node:20
    volumes:
      - ./:/app
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/app
    command: npx hatago serve --http

  db:
    image: postgres:15
    environment:
      - POSTGRES_PASSWORD=password
      - POSTGRES_DB=app
```

### Kubernetes

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hatago-hub
spec:
  replicas: 3
  template:
    spec:
      containers:
        - name: hatago
          image: hatago/hub:latest
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-secret
                  key: url
```

### CI/CD Pipeline

```yaml
# .github/workflows/deploy.yml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test
      - run: npm run build
      - run: hatago serve --tags production
```

## 📊 Performance Optimization

### Connection Pooling

```json
{
  "mcpServers": {
    "postgres": {
      "env": {
        "DATABASE_URL": "${DATABASE_URL}",
        "MAX_CONNECTIONS": "20",
        "IDLE_TIMEOUT": "30000"
      }
    }
  }
}
```

### Resource Limits

```bash
# Limit memory usage
NODE_OPTIONS="--max-old-space-size=2048" hatago serve

# CPU affinity
taskset -c 0-3 hatago serve
```

### Caching Headers

```javascript
// MCP response caching
{
  "cache": {
    "ttl": 3600,
    "strategy": "lru",
    "maxSize": "100mb"
  }
}
```

## 🔐 Security Best Practices

### Environment Variables

- Never commit `.env` files
- Use secrets management (Vault, AWS Secrets Manager)
- Rotate credentials regularly

### Network Security

```bash
# Firewall rules
ufw allow from 10.0.0.0/8 to any port 3535
ufw deny 3535

# SSL/TLS termination
nginx -c /etc/nginx/ssl-proxy.conf
```

### Authentication

```json
{
  "mcpServers": {
    "auth": {
      "command": "mcp-auth-server",
      "env": {
        "JWT_SECRET": "${JWT_SECRET}",
        "OAUTH_PROVIDERS": "github,google"
      }
    }
  }
}
```

## 🔍 Troubleshooting

### Health Checks

```bash
# Check all services
./scripts/health-check.sh

# Individual service check
curl http://localhost:3535/health/postgres
curl http://localhost:3535/health/github
```

### Debug Logging

```bash
# Maximum verbosity
LOG_LEVEL=debug hatago serve --verbose

# Filter by service
hatago serve --verbose 2>&1 | grep postgres
```

### Performance Profiling

```bash
# CPU profiling
node --prof hatago serve

# Memory profiling
node --trace-gc hatago serve
```

## 📈 Scaling Guidelines

### Horizontal Scaling

- Use tag-based server distribution
- Implement service discovery
- Configure load balancing

### Vertical Scaling

- Optimize connection pools
- Tune garbage collection
- Increase memory limits

### Database Scaling

- Read replicas for search
- Connection pooling
- Query optimization

## 🎯 Production Checklist

- [ ] Environment variables configured
- [ ] Database migrations run
- [ ] SSL certificates installed
- [ ] Monitoring configured
- [ ] Backup strategy implemented
- [ ] Rate limiting enabled
- [ ] Error tracking setup
- [ ] Documentation updated
- [ ] Load testing completed
- [ ] Security audit passed

## 📚 Resources

- [Production Deployment Guide](https://github.com/himorishige/hatago-mcp-hub/docs/deployment)
- [Security Best Practices](https://github.com/himorishige/hatago-mcp-hub/docs/security)
- [Performance Tuning](https://github.com/himorishige/hatago-mcp-hub/docs/performance)
- [Monitoring Setup](https://github.com/himorishige/hatago-mcp-hub/docs/monitoring)
