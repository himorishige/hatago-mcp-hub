/**
 * Metrics Collector
 *
 * Lightweight metrics collection for monitoring system performance.
 */

import { EventEmitter } from 'node:events';

export interface MetricPoint {
  timestamp: number;
  value: number;
  labels?: Record<string, string>;
}

export interface Histogram {
  count: number;
  sum: number;
  buckets: Map<number, number>; // bucket upper bound -> count
}

export interface MetricSnapshot {
  counter: number;
  histogram?: {
    count: number;
    sum: number;
    mean: number;
    p50: number;
    p95: number;
    p99: number;
  };
  gauge: number;
  timestamp: number;
}

export class MetricsCollector extends EventEmitter {
  private counters = new Map<string, number>();
  private gauges = new Map<string, number>();
  private histograms = new Map<string, number[]>(); // Store raw values for percentile calculation
  private labels = new Map<string, Record<string, string>>();
  private readonly maxHistogramValues = 10000; // Prevent memory bloat

  // Default histogram buckets (in milliseconds for latency)
  private readonly defaultBuckets = [
    1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000,
  ];

  /**
   * Increment a counter metric
   */
  incrementCounter(
    name: string,
    value: number = 1,
    labels?: Record<string, string>,
  ): void {
    const key = this.getMetricKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + value);

    if (labels) {
      this.labels.set(key, labels);
    }

    this.emit('metric', { type: 'counter', name, value, labels });
  }

  /**
   * Set a gauge metric value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getMetricKey(name, labels);
    this.gauges.set(key, value);

    if (labels) {
      this.labels.set(key, labels);
    }

    this.emit('metric', { type: 'gauge', name, value, labels });
  }

  /**
   * Record a histogram observation
   */
  recordHistogram(
    name: string,
    value: number,
    labels?: Record<string, string>,
  ): void {
    const key = this.getMetricKey(name, labels);
    let values = this.histograms.get(key);

    if (!values) {
      values = [];
      this.histograms.set(key, values);
    }

    values.push(value);

    // Prevent memory bloat by keeping only recent values
    if (values.length > this.maxHistogramValues) {
      values.shift();
    }

    if (labels) {
      this.labels.set(key, labels);
    }

    this.emit('metric', { type: 'histogram', name, value, labels });
  }

  /**
   * Time an operation and record to histogram
   */
  timer(name: string, labels?: Record<string, string>) {
    const start = Date.now();
    return {
      end: () => {
        const duration = Date.now() - start;
        this.recordHistogram(name, duration, labels);
        return duration;
      },
    };
  }

  /**
   * Get snapshot of all metrics
   */
  getSnapshot(): Record<string, MetricSnapshot> {
    const snapshot: Record<string, MetricSnapshot> = {};
    const now = Date.now();

    // Process counters
    for (const [key, value] of this.counters) {
      snapshot[key] = {
        counter: value,
        gauge: 0,
        timestamp: now,
      };
    }

    // Process gauges
    for (const [key, value] of this.gauges) {
      if (snapshot[key]) {
        snapshot[key].gauge = value;
      } else {
        snapshot[key] = {
          counter: 0,
          gauge: value,
          timestamp: now,
        };
      }
    }

    // Process histograms
    for (const [key, values] of this.histograms) {
      if (values.length === 0) continue;

      const sorted = [...values].sort((a, b) => a - b);
      const count = sorted.length;
      const sum = sorted.reduce((a, b) => a + b, 0);
      const mean = sum / count;

      const histogram = {
        count,
        sum,
        mean,
        p50: this.percentile(sorted, 0.5),
        p95: this.percentile(sorted, 0.95),
        p99: this.percentile(sorted, 0.99),
      };

      if (snapshot[key]) {
        snapshot[key].histogram = histogram;
      } else {
        snapshot[key] = {
          counter: 0,
          gauge: 0,
          histogram,
          timestamp: now,
        };
      }
    }

    return snapshot;
  }

  /**
   * Get metrics in Prometheus format
   */
  getPrometheusFormat(): string {
    const lines: string[] = [];
    const snapshot = this.getSnapshot();

    for (const [key, metric] of Object.entries(snapshot)) {
      const { name, labelString } = this.parseMetricKey(key);

      // Counter
      if (metric.counter > 0) {
        lines.push(`# TYPE ${name}_total counter`);
        lines.push(`${name}_total${labelString} ${metric.counter}`);
      }

      // Gauge
      if (metric.gauge !== 0) {
        lines.push(`# TYPE ${name} gauge`);
        lines.push(`${name}${labelString} ${metric.gauge}`);
      }

      // Histogram
      if (metric.histogram) {
        const hist = metric.histogram;
        lines.push(`# TYPE ${name} histogram`);
        lines.push(`${name}_count${labelString} ${hist.count}`);
        lines.push(`${name}_sum${labelString} ${hist.sum}`);

        // Add percentile buckets
        for (const bucket of this.defaultBuckets) {
          const count = this.countBelowThreshold(
            [...(this.histograms.get(key) || [])],
            bucket,
          );
          lines.push(
            `${name}_bucket{le="${bucket}"${labelString.slice(1)} ${count}`,
          );
        }
        lines.push(
          `${name}_bucket{le="+Inf"${labelString.slice(1)} ${hist.count}`,
        );
      }
    }

    return lines.join('\n');
  }

  /**
   * Reset all metrics
   */
  reset(): void {
    this.counters.clear();
    this.gauges.clear();
    this.histograms.clear();
    this.labels.clear();
  }

  /**
   * Get specific metric value
   */
  getMetric(
    name: string,
    labels?: Record<string, string>,
  ): MetricSnapshot | undefined {
    const key = this.getMetricKey(name, labels);
    const snapshot = this.getSnapshot();
    return snapshot[key];
  }

  private getMetricKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }

    const labelPairs = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}="${value}"`)
      .join(',');

    return `${name}{${labelPairs}}`;
  }

  private parseMetricKey(key: string): { name: string; labelString: string } {
    const braceIndex = key.indexOf('{');
    if (braceIndex === -1) {
      return { name: key, labelString: '' };
    }

    const name = key.slice(0, braceIndex);
    const labelString = key.slice(braceIndex);
    return { name, labelString };
  }

  private percentile(sortedValues: number[], p: number): number {
    if (sortedValues.length === 0) return 0;

    const index = p * (sortedValues.length - 1);
    const lower = Math.floor(index);
    const upper = Math.ceil(index);
    const weight = index - lower;

    if (lower === upper) {
      return sortedValues[lower];
    }

    return sortedValues[lower] * (1 - weight) + sortedValues[upper] * weight;
  }

  private countBelowThreshold(values: number[], threshold: number): number {
    return values.filter((value) => value <= threshold).length;
  }
}

// Predefined metric names for consistency
export const METRICS = {
  // Request metrics
  REQUESTS_TOTAL: 'hatago_requests_total',
  REQUEST_DURATION: 'hatago_request_duration_ms',
  REQUEST_SIZE: 'hatago_request_size_bytes',
  RESPONSE_SIZE: 'hatago_response_size_bytes',

  // Tool call metrics
  TOOL_CALLS_TOTAL: 'hatago_tool_calls_total',
  TOOL_CALL_DURATION: 'hatago_tool_call_duration_ms',
  TOOL_CALL_ERRORS: 'hatago_tool_call_errors_total',

  // Server metrics
  SERVERS_CONNECTED: 'hatago_servers_connected',
  SERVER_CONNECTIONS_TOTAL: 'hatago_server_connections_total',
  SERVER_CONNECTION_DURATION: 'hatago_server_connection_duration_ms',
  SERVER_ERRORS: 'hatago_server_errors_total',

  // Stream metrics
  STREAMS_ACTIVE: 'hatago_streams_active',
  STREAM_MESSAGES: 'hatago_stream_messages_total',
  STREAM_DURATION: 'hatago_stream_duration_ms',

  // Resource metrics
  MEMORY_USAGE: 'hatago_memory_usage_bytes',
  CPU_USAGE: 'hatago_cpu_usage_percent',
  GOROUTINES: 'hatago_goroutines', // Actually async operations in Node
} as const;

// Global metrics collector instance
export const metrics = new MetricsCollector();

// Convenience functions
export function incrementCounter(
  name: string,
  value?: number,
  labels?: Record<string, string>,
): void {
  metrics.incrementCounter(name, value, labels);
}

export function setGauge(
  name: string,
  value: number,
  labels?: Record<string, string>,
): void {
  metrics.setGauge(name, value, labels);
}

export function recordHistogram(
  name: string,
  value: number,
  labels?: Record<string, string>,
): void {
  metrics.recordHistogram(name, value, labels);
}

export function timer(name: string, labels?: Record<string, string>) {
  return metrics.timer(name, labels);
}

export function getMetrics(): Record<string, MetricSnapshot> {
  return metrics.getSnapshot();
}

export function exportPrometheus(): string {
  return metrics.getPrometheusFormat();
}
