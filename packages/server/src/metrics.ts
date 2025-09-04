/**
 * Minimal, opt-in metrics for Hatago server
 * Enabled only when HATAGO_METRICS=1.
 *
 * Exposes simple counters/gauges and a JSON snapshot.
 */

import type { Hono } from 'hono';
import type { HatagoHub } from '@himorishige/hatago-hub';

type Counters = {
  tool_calls_total: number;
  tool_errors_total: number;
  retries_total: number;
};

type Gauges = {
  active_sessions: number;
  sse_clients: number;
};

const enabled = () => process.env.HATAGO_METRICS === '1';

const counters: Counters = {
  tool_calls_total: 0,
  tool_errors_total: 0,
  retries_total: 0
};

const gauges: Gauges = {
  active_sessions: 0,
  sse_clients: 0
};

export function registerHubMetrics(hub: HatagoHub): void {
  if (!enabled()) return;

  // Count tool calls and errors via hub event
  hub.on('tool:called', (evt) => {
    counters.tool_calls_total++;
    const result = (evt as { result?: { isError?: boolean } }).result;
    if (result?.isError) {
      counters.tool_errors_total++;
    }
  });
}

export function maybeRegisterMetricsEndpoint(app: Hono): void {
  if (!enabled()) return;

  app.get('/metrics', (c) => {
    const snapshot = {
      counters: { ...counters },
      gauges: { ...gauges },
      timestamp: Date.now()
    };
    return c.json(snapshot);
  });
}

// For future use (e.g., tests or adapters)
export const metrics = {
  enabled,
  counters,
  gauges
};
