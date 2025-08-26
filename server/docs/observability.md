# Observability Guide

This guide covers monitoring, tracing, metrics collection, and logging in Hatago MCP Hub. Hatago provides comprehensive observability features for production deployments.

## Overview

Hatago's observability stack includes:

- **Distributed Tracing**: Request tracing across server boundaries
- **Metrics Collection**: Prometheus-compatible metrics
- **Health Monitoring**: Kubernetes-compatible health checks
- **Structured Logging**: JSON logging with sanitization
- **Performance Monitoring**: Response times and error rates

## Distributed Tracing

### Overview

Hatago implements distributed tracing using AsyncLocalStorage for context propagation, allowing you to trace requests across multiple MCP servers and components.

### Configuration

Enable tracing in your configuration:

```json
{
  "observability": {
    "tracing": {
      "enabled": true,
      "serviceName": "hatago-hub",
      "exportInterval": 5000,
      "samplingRate": 1.0,
      "exporter": {
        "type": "console", // "console", "jaeger", "zipkin"
        "endpoint": "http://localhost:14268/api/traces"
      }
    }
  }
}
```

### Environment Variables

```bash
# Enable tracing
HATAGO_TRACING_ENABLED=true

# Service identification
HATAGO_TRACING_SERVICE_NAME=hatago-hub
HATAGO_TRACING_VERSION=1.0.0

# Sampling configuration
HATAGO_TRACING_SAMPLING_RATE=1.0

# Exporter configuration
HATAGO_TRACING_EXPORTER=jaeger
HATAGO_TRACING_ENDPOINT=http://localhost:14268/api/traces
```

### Trace Structure

Each trace contains:

```json
{
  "traceId": "12345678901234567890123456789012",
  "spanId": "1234567890123456",
  "parentSpanId": "0987654321098765",
  "operationName": "mcp.tools.call",
  "startTime": "2024-01-15T10:00:00.000Z",
  "duration": "142ms",
  "tags": {
    "service.name": "hatago-hub",
    "mcp.server.id": "filesystem",
    "mcp.tool.name": "read_file",
    "mcp.session.id": "session-123",
    "http.method": "POST",
    "http.status_code": 200
  },
  "logs": [
    {
      "timestamp": "2024-01-15T10:00:00.050Z",
      "level": "info",
      "message": "Tool call started",
      "fields": {
        "tool": "read_file",
        "args": { "path": "/tmp/file.txt" }
      }
    }
  ]
}
```

### Using Trace Context

```typescript
import { DistributedTracing } from "@himorishige/hatago/observability";

// Start a new trace
const span = DistributedTracing.startSpan("my-operation", {
  "operation.type": "tool-call",
  "server.id": "my-server",
});

try {
  // Your operation here
  const result = await performOperation();

  // Add metadata to trace
  span.setTag("result.size", result.length);
  span.log({ level: "info", message: "Operation completed" });

  return result;
} catch (error) {
  // Record errors in trace
  span.setTag("error", true);
  span.log({
    level: "error",
    message: error.message,
    stack: error.stack,
  });
  throw error;
} finally {
  span.finish();
}
```

### Trace Correlation

Traces are automatically correlated across:

- HTTP requests (via trace headers)
- Tool calls between servers
- Resource reads
- Prompt generations
- Configuration changes

### Viewing Traces

#### Console Output

```bash
hatago serve --log-level debug
```

#### Jaeger UI

1. Run Jaeger locally:

```bash
docker run -d --name jaeger \
  -p 16686:16686 \
  -p 14268:14268 \
  jaegertracing/all-in-one:latest
```

2. Configure Hatago:

```json
{
  "observability": {
    "tracing": {
      "enabled": true,
      "exporter": {
        "type": "jaeger",
        "endpoint": "http://localhost:14268/api/traces"
      }
    }
  }
}
```

3. View traces at http://localhost:16686

## Metrics Collection

### Overview

Hatago collects Prometheus-compatible metrics for monitoring system performance and health.

### Configuration

```json
{
  "observability": {
    "metrics": {
      "enabled": true,
      "port": 9090,
      "path": "/metrics",
      "collectInterval": 5000,
      "histogramBuckets": [0.001, 0.005, 0.01, 0.05, 0.1, 0.5, 1, 2, 5]
    }
  }
}
```

### Available Metrics

#### Request Metrics

```
# HTTP request duration
hatago_http_request_duration_seconds{method="POST",route="/mcp",status="200"}

# HTTP request total
hatago_http_requests_total{method="POST",route="/mcp",status="200"}

# Tool call duration
hatago_mcp_tool_call_duration_seconds{server="filesystem",tool="read_file"}

# Tool call total
hatago_mcp_tool_calls_total{server="filesystem",tool="read_file",status="success"}
```

#### System Metrics

```
# Active sessions
hatago_sessions_active

# Connected servers
hatago_servers_connected{type="npx"}

# Circuit breaker state
hatago_circuit_breaker_state{server="filesystem"} # 0=closed, 1=open, 2=half-open

# Rate limiter state
hatago_rate_limiter_requests{window="60s"}
```

#### Performance Metrics

```
# Memory usage
hatago_memory_usage_bytes{type="rss"}

# Event loop lag
hatago_event_loop_lag_seconds

# GC duration
hatago_gc_duration_seconds{type="minor"}
```

### Accessing Metrics

#### Metrics Endpoint

```bash
curl http://localhost:9090/metrics
```

#### CLI Command

```bash
hatago metrics

# Specific metric
hatago metrics --filter "hatago_tool_calls_total"

# Watch mode
hatago metrics --watch
```

#### Programmatic Access

```typescript
import { MetricsCollector } from "@himorishige/hatago/observability";

const metrics = MetricsCollector.getInstance();

// Get all metrics
const allMetrics = await metrics.getMetrics();

// Get specific metrics
const httpMetrics = await metrics.getMetrics("hatago_http_*");

// Custom metrics
metrics.incrementCounter("my_custom_counter", { label: "value" });
metrics.recordHistogram("my_operation_duration", 0.142, { operation: "read" });
```

### Prometheus Integration

#### Prometheus Configuration

```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: "hatago"
    static_configs:
      - targets: ["localhost:9090"]
    scrape_interval: 5s
    metrics_path: /metrics
```

#### Grafana Dashboard

Sample dashboard configuration:

```json
{
  "dashboard": {
    "title": "Hatago MCP Hub",
    "panels": [
      {
        "title": "Request Rate",
        "type": "graph",
        "targets": [
          {
            "expr": "rate(hatago_http_requests_total[5m])",
            "legendFormat": "{{method}} {{route}}"
          }
        ]
      },
      {
        "title": "Tool Call Duration",
        "type": "heatmap",
        "targets": [
          {
            "expr": "hatago_mcp_tool_call_duration_seconds",
            "legendFormat": "{{server}}.{{tool}}"
          }
        ]
      }
    ]
  }
}
```

## Health Monitoring

### Overview

Hatago provides Kubernetes-compatible health check endpoints for orchestration and monitoring.

### Health Check Types

#### Liveness Probe

Indicates if the application is running:

```bash
GET /health/live
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "uptime": "2h 30m 15s"
}
```

#### Readiness Probe

Indicates if the application is ready to serve requests:

```bash
GET /health/ready
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "checks": {
    "servers": "ok",
    "database": "ok",
    "external_apis": "ok"
  }
}
```

#### Startup Probe

Indicates if the application has started:

```bash
GET /health/startup
```

Response:

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:00:00.000Z",
  "startupDuration": "5.2s"
}
```

### Kubernetes Configuration

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hatago-hub
spec:
  template:
    spec:
      containers:
        - name: hatago
          image: hatago:latest
          ports:
            - containerPort: 3000
          livenessProbe:
            httpGet:
              path: /health/live
              port: 3000
            initialDelaySeconds: 10
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /health/ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
          startupProbe:
            httpGet:
              path: /health/startup
              port: 3000
            failureThreshold: 30
            periodSeconds: 10
```

### Custom Health Checks

```typescript
import { HealthMonitor } from "@himorishige/hatago/observability";

const healthMonitor = HealthMonitor.getInstance();

// Add custom health check
healthMonitor.addHealthCheck("database", async () => {
  try {
    await database.ping();
    return { status: "ok" };
  } catch (error) {
    return {
      status: "error",
      message: error.message,
      lastError: new Date().toISOString(),
    };
  }
});

// Check health programmatically
const health = await healthMonitor.check();
console.log(health.overall); // 'ok' | 'degraded' | 'error'
```

## Structured Logging

### Overview

Hatago uses structured JSON logging with automatic sanitization of sensitive data.

### Configuration

```json
{
  "observability": {
    "logging": {
      "level": "info", // "debug", "info", "warn", "error"
      "format": "json", // "json", "pretty"
      "sanitize": true,
      "maskedFields": ["password", "token", "secret", "key"],
      "output": {
        "console": true,
        "file": {
          "enabled": true,
          "path": "./logs/hatago.log",
          "maxSize": "10MB",
          "maxFiles": 5
        }
      }
    }
  }
}
```

### Log Format

```json
{
  "timestamp": "2024-01-15T10:00:00.000Z",
  "level": "info",
  "component": "proxy-tool-manager",
  "message": "Tool call completed",
  "traceId": "12345678901234567890123456789012",
  "spanId": "1234567890123456",
  "sessionId": "session-123",
  "server": "filesystem",
  "tool": "read_file",
  "duration": 142,
  "metadata": {
    "args": {
      "path": "/tmp/file.txt"
    },
    "result": {
      "size": 1024,
      "mimeType": "text/plain"
    }
  }
}
```

### Using the Logger

```typescript
import { logger } from "@himorishige/hatago/observability";

// Basic logging
logger.info("Operation completed");
logger.error("Operation failed", { error: error.message });

// With context
logger.info("Tool call started", {
  server: "filesystem",
  tool: "read_file",
  args: { path: "/tmp/file.txt" },
});

// Structured data
logger.info("Performance metric", {
  metric: "response_time",
  value: 142,
  unit: "ms",
  server: "filesystem",
});
```

### Log Analysis

#### Using jq

```bash
# Filter by level
cat hatago.log | jq 'select(.level == "error")'

# Filter by component
cat hatago.log | jq 'select(.component == "proxy-tool-manager")'

# Extract performance metrics
cat hatago.log | jq 'select(.metric) | {timestamp, metric, value, unit}'

# Trace requests
cat hatago.log | jq 'select(.traceId == "12345678901234567890123456789012")'
```

#### Log Aggregation

With ELK stack:

```yaml
# logstash.conf
input {
file {
path => "/var/log/hatago/*.log"
codec => "json"
}
}

filter {
if [component] {
mutate {
add_tag => [ "%{component}" ]
}
}
}

output {
elasticsearch {
hosts => ["localhost:9200"]
index => "hatago-%{+YYYY.MM.dd}"
}
}
```

## Performance Monitoring

### Response Time Tracking

Automatically tracked for:

- HTTP requests
- Tool calls
- Resource reads
- Prompt generations
- Server connections

### Error Rate Monitoring

```bash
# Check error rates
hatago metrics --filter "error" --window 1h

# Alert on high error rate
hatago metrics --alert error_rate_threshold=0.05
```

### Resource Usage

```bash
# Check memory usage
hatago metrics --filter "memory"

# Check event loop lag
hatago metrics --filter "event_loop_lag"

# Check GC performance
hatago metrics --filter "gc_duration"
```

## Alerting

### Prometheus Alerts

```yaml
# alerts.yml
groups:
  - name: hatago
    rules:
      - alert: HatagoHighErrorRate
        expr: rate(hatago_http_requests_total{status=~"5.."}[5m]) > 0.05
        for: 2m
        labels:
          severity: warning
        annotations:
          summary: "High error rate in Hatago"
          description: "Error rate is {{ $value }} requests per second"

      - alert: HatagoHighLatency
        expr: histogram_quantile(0.95, hatago_http_request_duration_seconds) > 1
        for: 5m
        labels:
          severity: warning
        annotations:
          summary: "High latency in Hatago"
          description: "95th percentile latency is {{ $value }}s"
```

### Custom Alerts

```typescript
import {
  MetricsCollector,
  AlertManager,
} from "@himorishige/hatago/observability";

const alertManager = new AlertManager();

// Define alert rules
alertManager.addRule({
  name: "high_memory_usage",
  condition: (metrics) => {
    const memoryUsage = metrics.get("hatago_memory_usage_bytes");
    return memoryUsage > 1024 * 1024 * 512; // 512MB
  },
  action: async (metrics) => {
    logger.warn("High memory usage detected", {
      usage: metrics.get("hatago_memory_usage_bytes"),
    });
    // Send notification, scale up, etc.
  },
});

// Check alerts periodically
setInterval(async () => {
  await alertManager.checkRules();
}, 30000);
```

## Troubleshooting

### Common Issues

#### High Response Times

1. Check metrics: `hatago metrics --filter duration`
2. Check trace details: `hatago trace <trace-id>`
3. Check server health: `hatago health`
4. Check resource usage: `hatago metrics --filter memory,cpu`

#### Missing Traces

1. Verify tracing is enabled
2. Check sampling rate configuration
3. Verify exporter configuration
4. Check network connectivity to trace backend

#### High Error Rates

1. Check error logs: `tail -f logs/hatago.log | jq 'select(.level == "error")'`
2. Check circuit breaker state: `hatago metrics --filter circuit_breaker`
3. Check server connectivity: `hatago npx status`
4. Check rate limiting: `hatago metrics --filter rate_limiter`

This observability stack provides comprehensive monitoring and debugging capabilities for production Hatago deployments.
