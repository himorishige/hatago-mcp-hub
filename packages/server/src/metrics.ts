/**
 * Minimal, opt-in metrics for Hatago server
 * Enabled only when HATAGO_METRICS=1.
 *
 * Exposes simple counters/gauges and a JSON snapshot.
 */

import type { Hono } from 'hono';
import type { HubEvent, IHub } from '@himorishige/hatago-hub';
import * as HubExports from '@himorishige/hatago-hub';
// Prepare for HUB_EVENT_KEYS availability while keeping workspace self‑contained. [CMV][PEC]
const TOOL_CALLED: HubEvent = (() => {
  try {
    const maybe = (HubExports as Record<string, unknown>)['HUB_EVENT_KEYS'];
    if (maybe && typeof maybe === 'object') {
      const tk = (maybe as Record<string, unknown>)['toolCalled'];
      if (typeof tk === 'string') return tk as HubEvent;
    }
  } catch {
    // fallthrough
  }
  return 'tool:called';
})();

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

export function registerHubMetrics(hub: Pick<IHub, 'on'>): void {
  if (!enabled()) return;

  // Count tool calls and errors via hub event
  hub.on(TOOL_CALLED, (evt: unknown) => {
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
