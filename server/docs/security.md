# Security Guide

This guide covers the security features in Hatago MCP Hub, including authentication, authorization, rate limiting, circuit breakers, and security best practices.

## Overview

Hatago provides a comprehensive security framework designed for production deployments:

- **Authentication**: JWT-based authentication with multiple providers
- **Authorization**: Role-based access control (RBAC)
- **Rate Limiting**: Sliding window rate limiting with customizable rules
- **Circuit Breakers**: Automatic failure isolation and recovery
- **Input Validation**: Request validation and sanitization
- **Audit Logging**: Security event logging and monitoring
- **Data Protection**: Log sanitization and secret management

## Authentication

### JWT Authentication

Hatago uses JSON Web Tokens (JWT) for stateless authentication.

#### Configuration

```json
{
  "security": {
    "authentication": {
      "enabled": true,
      "type": "jwt",
      "secret": "${HATAGO_AUTH_SECRET}",
      "algorithms": ["HS256", "RS256"],
      "expiresIn": "24h",
      "issuer": "hatago-hub",
      "audience": ["mcp-clients"],
      "clockTolerance": 60
    }
  }
}
```

#### Environment Variables

```bash
# JWT secret (required)
HATAGO_AUTH_SECRET=your-super-secure-secret-key-here

# Optional: RSA keys for RS256
HATAGO_AUTH_PRIVATE_KEY_PATH=/path/to/private.pem
HATAGO_AUTH_PUBLIC_KEY_PATH=/path/to/public.pem

# Token settings
HATAGO_AUTH_EXPIRES_IN=24h
HATAGO_AUTH_ISSUER=hatago-hub
```

#### Obtaining Tokens

##### Built-in Token Endpoint

```bash
# Login endpoint
POST /auth/login
Content-Type: application/json

{
  "username": "user",
  "password": "password",
  "scope": ["mcp:tools", "mcp:resources"]
}
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "24h",
  "tokenType": "Bearer"
}
```

##### Custom Token Generation

```typescript
import { AuthenticationManager } from '@himorishige/hatago/security'

const authManager = new AuthenticationManager({
  secret: process.env.HATAGO_AUTH_SECRET,
  expiresIn: '24h'
})

const token = authManager.generateToken({
  sub: 'user-123',
  username: 'john.doe',
  roles: ['user', 'mcp-client'],
  permissions: ['mcp:tools', 'mcp:resources'],
  sessionId: 'session-456'
})
```

#### Using Authentication

##### HTTP Client

```bash
# Include JWT in Authorization header
curl -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." \
     -X POST http://localhost:3000/mcp \
     -d '{"method": "tools/list"}'
```

##### MCP Client Configuration

```json
{
  "servers": {
    "hatago": {
      "command": "npx",
      "args": ["@himorishige/hatago", "serve"],
      "env": {
        "HATAGO_AUTH_TOKEN": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
      }
    }
  }
}
```

### OAuth 2.0 Integration

For enterprise deployments, Hatago can integrate with OAuth 2.0 providers:

```json
{
  "security": {
    "authentication": {
      "type": "oauth2",
      "provider": {
        "authUrl": "https://auth.company.com/oauth/authorize",
        "tokenUrl": "https://auth.company.com/oauth/token",
        "userInfoUrl": "https://auth.company.com/oauth/userinfo",
        "clientId": "${OAUTH_CLIENT_ID}",
        "clientSecret": "${OAUTH_CLIENT_SECRET}",
        "scope": ["openid", "profile", "mcp"]
      }
    }
  }
}
```

## Authorization

### Role-Based Access Control (RBAC)

Hatago implements RBAC to control access to MCP resources.

#### Permission Model

```typescript
// Permission format: resource:action:scope
const permissions = [
  'mcp:tools:*',              // All tool operations
  'mcp:resources:read',       // Read resources only
  'mcp:prompts:generate',     // Generate prompts only
  'server:filesystem:*',      // All operations on filesystem server
  'admin:servers:manage'      // Server management
]
```

#### Role Configuration

```json
{
  "security": {
    "authorization": {
      "enabled": true,
      "roles": {
        "admin": {
          "permissions": [
            "mcp:*:*",
            "admin:*:*",
            "server:*:*"
          ]
        },
        "user": {
          "permissions": [
            "mcp:tools:call",
            "mcp:resources:read",
            "mcp:prompts:generate"
          ]
        },
        "readonly": {
          "permissions": [
            "mcp:tools:list",
            "mcp:resources:list",
            "mcp:prompts:list"
          ]
        }
      },
      "defaultRole": "readonly"
    }
  }
}
```

#### Custom Authorization

```typescript
import { AuthorizationManager } from '@himorishige/hatago/security'

const authzManager = new AuthorizationManager()

// Add custom permission check
authzManager.addRule('server-specific', async (user, resource, action) => {
  if (resource.startsWith('server:')) {
    const serverName = resource.split(':')[1]
    return user.allowedServers?.includes(serverName) || false
  }
  return true
})

// Check permissions
const hasPermission = await authzManager.checkPermission(
  user,
  'server:filesystem:tools:call'
)
```

## Rate Limiting

### Sliding Window Rate Limiting

Hatago implements sliding window rate limiting to protect against abuse and ensure fair resource usage.

#### Configuration

```json
{
  "security": {
    "rateLimit": {
      "enabled": true,
      "algorithm": "sliding-window",
      "rules": [
        {
          "name": "global",
          "windowMs": 60000,
          "max": 1000,
          "keyGenerator": "ip"
        },
        {
          "name": "per-user",
          "windowMs": 60000,
          "max": 100,
          "keyGenerator": "user"
        },
        {
          "name": "tool-calls",
          "windowMs": 60000,
          "max": 50,
          "keyGenerator": "user",
          "filter": "mcp:tools:call"
        }
      ]
    }
  }
}
```

#### Environment Variables

```bash
# Global rate limits
HATAGO_RATE_LIMIT_WINDOW=60000
HATAGO_RATE_LIMIT_MAX=1000

# Per-user limits
HATAGO_RATE_LIMIT_USER_WINDOW=60000
HATAGO_RATE_LIMIT_USER_MAX=100

# Tool-specific limits
HATAGO_RATE_LIMIT_TOOLS_MAX=50
```

#### Rate Limit Headers

Hatago includes rate limit information in response headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642694400
X-RateLimit-RetryAfter: 45
```

#### Custom Rate Limiting

```typescript
import { RateLimiter } from '@himorishige/hatago/security'

const rateLimiter = new RateLimiter({
  windowMs: 60000,
  max: 100
})

// Custom key generation
rateLimiter.setKeyGenerator((req) => {
  const user = req.user?.id
  const ip = req.ip
  return `${user}:${ip}`
})

// Custom rate limit rules
rateLimiter.addRule('expensive-operations', {
  windowMs: 300000, // 5 minutes
  max: 10,
  filter: (req) => req.body?.method?.includes('generate')
})
```

## Circuit Breakers

### Automatic Failure Isolation

Circuit breakers prevent cascade failures by automatically isolating failing services.

#### Configuration

```json
{
  "security": {
    "circuitBreaker": {
      "enabled": true,
      "rules": {
        "default": {
          "failureThreshold": 5,
          "resetTimeoutMs": 30000,
          "halfOpenMaxCalls": 3,
          "errorClassification": {
            "timeout": "high",
            "connection": "critical",
            "auth": "low",
            "validation": "low"
          }
        },
        "external-services": {
          "failureThreshold": 3,
          "resetTimeoutMs": 60000,
          "errorClassification": {
            "timeout": "critical",
            "network": "high"
          }
        }
      }
    }
  }
}
```

#### Circuit Breaker States

1. **Closed** (Normal): All requests pass through
2. **Open** (Failing): All requests are rejected
3. **Half-Open** (Testing): Limited requests allowed to test recovery

#### Error Classification

Errors are classified by severity:
- **Low**: Authentication, validation errors
- **Medium**: Business logic errors
- **High**: Timeout, network errors
- **Critical**: Connection failures, service unavailable

#### Monitoring Circuit Breakers

```bash
# Check circuit breaker status
hatago metrics --filter circuit_breaker

# View circuit breaker events
tail -f logs/hatago.log | jq 'select(.component == "circuit-breaker")'
```

## Input Validation & Sanitization

### Request Validation

All incoming requests are validated against schemas:

```typescript
import { ValidationManager } from '@himorishige/hatago/security'

const validator = new ValidationManager()

// Add custom validation rules
validator.addRule('tool-call', {
  method: { type: 'string', enum: ['tools/call'] },
  params: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 100 },
      arguments: { type: 'object' }
    },
    required: ['name']
  }
})

// Validate request
const isValid = validator.validate('tool-call', request)
```

### Log Sanitization

Sensitive data is automatically sanitized from logs:

```json
{
  "security": {
    "logging": {
      "sanitize": true,
      "maskedFields": [
        "password", "token", "secret", "key", "auth",
        "jwt", "bearer", "authorization", "cookie"
      ],
      "customSanitizer": {
        "patterns": [
          "\\b[A-Za-z0-9+/]{40,}={0,2}\\b", // Base64 tokens
          "\\bsk-[A-Za-z0-9]{32,}\\b",       // API keys
          "\\b\\d{4}-\\d{4}-\\d{4}-\\d{4}\\b" // Credit cards
        ]
      }
    }
  }
}
```

## Audit Logging

### Security Event Logging

All security-related events are logged for audit purposes:

```json
{
  "timestamp": "2024-01-15T10:00:00.000Z",
  "level": "info",
  "component": "security-audit",
  "event": "authentication_success",
  "user": "john.doe",
  "sessionId": "session-123",
  "ip": "192.168.1.100",
  "userAgent": "Mozilla/5.0...",
  "metadata": {
    "method": "jwt",
    "roles": ["user", "mcp-client"]
  }
}
```

### Audit Events

- **Authentication**: login, logout, token refresh
- **Authorization**: permission granted/denied
- **Rate Limiting**: rate limit exceeded
- **Circuit Breaker**: state changes
- **Configuration**: security setting changes
- **Suspicious Activity**: repeated failures, unusual patterns

### Compliance Reporting

```bash
# Generate audit report
hatago audit --start 2024-01-01 --end 2024-01-31 --format json

# Filter by event type
hatago audit --event authentication_failure --last 24h

# Export for compliance
hatago audit --export csv --output audit-2024-01.csv
```

## Network Security

### TLS/SSL Configuration

```json
{
  "http": {
    "ssl": {
      "enabled": true,
      "cert": "/path/to/cert.pem",
      "key": "/path/to/key.pem",
      "ca": "/path/to/ca.pem",
      "protocols": ["TLSv1.2", "TLSv1.3"],
      "ciphers": ["ECDHE-RSA-AES256-GCM-SHA384", "ECDHE-RSA-AES128-GCM-SHA256"]
    }
  }
}
```

### Network Access Control

```json
{
  "security": {
    "network": {
      "allowedIPs": ["192.168.1.0/24", "10.0.0.0/8"],
      "blockedIPs": ["0.0.0.0/0"],
      "allowedDomains": ["*.company.com", "api.trusted.com"],
      "cors": {
        "enabled": true,
        "origin": ["https://app.company.com"],
        "credentials": true
      }
    }
  }
}
```

## Secret Management

### Environment Variable Protection

```bash
# Use secure secret management
export HATAGO_AUTH_SECRET=$(vault kv get -field=secret secret/hatago/auth)
export GITHUB_TOKEN=$(kubectl get secret github-token -o jsonpath='{.data.token}' | base64 -d)

# Avoid hardcoded secrets
hatago serve --config-from-env
```

### Configuration Encryption

```bash
# Encrypt sensitive configuration
hatago config encrypt --input config.json --output config.encrypted

# Decrypt at runtime
hatago serve --config config.encrypted --decrypt-key ${ENCRYPTION_KEY}
```

## Security Best Practices

### Production Deployment

1. **Use HTTPS**: Always use TLS/SSL in production
2. **Strong Secrets**: Use cryptographically strong secrets (256-bit)
3. **Token Rotation**: Implement regular token rotation
4. **Principle of Least Privilege**: Grant minimal necessary permissions
5. **Monitor Security Events**: Set up alerting for security events
6. **Regular Updates**: Keep Hatago and dependencies updated
7. **Backup Security**: Secure configuration and audit logs

### Development Security

1. **No Secrets in Code**: Never commit secrets to version control
2. **Environment Separation**: Use different secrets for dev/prod
3. **Local HTTPS**: Use HTTPS even in development
4. **Test Security**: Include security tests in CI/CD
5. **Dependency Scanning**: Regularly scan for vulnerable dependencies

### Monitoring & Alerting

```yaml
# Security monitoring rules
rules:
- alert: AuthenticationFailureSpike
  expr: rate(hatago_auth_failures[5m]) > 10
  labels:
    severity: warning
  annotations:
    summary: "High authentication failure rate"

- alert: RateLimitExceeded
  expr: rate(hatago_rate_limit_exceeded[1m]) > 5
  labels:
    severity: critical
  annotations:
    summary: "Rate limiting threshold exceeded"

- alert: CircuitBreakerOpen
  expr: hatago_circuit_breaker_state == 1
  labels:
    severity: warning
  annotations:
    summary: "Circuit breaker opened for {{ $labels.server }}"
```

### Security Checklist

#### Pre-Production
- [ ] Authentication configured and tested
- [ ] Authorization rules defined and validated
- [ ] Rate limiting configured appropriately
- [ ] Circuit breakers configured for all external services
- [ ] TLS/SSL certificates installed and valid
- [ ] Security logging enabled and monitored
- [ ] Audit trail configured
- [ ] Network access controls in place
- [ ] Secrets management implemented
- [ ] Security tests passing

#### Runtime Monitoring
- [ ] Authentication success/failure rates
- [ ] Authorization denial patterns
- [ ] Rate limiting effectiveness
- [ ] Circuit breaker state changes
- [ ] Security event frequency
- [ ] Audit log integrity
- [ ] Certificate expiration dates
- [ ] Dependency vulnerabilities

This security framework provides comprehensive protection for Hatago deployments while maintaining usability and performance.