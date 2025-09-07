#!/usr/bin/env node
/* global process, console, setImmediate */
/**
 * Run local hub in‑process and collect metrics.
 * - startup_ms, tools_list_ms
 * - p95 latency for resources/read hatago://servers
 * - active handles/requests, memoryUsage and v8 heap stats
 */

import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { performance } from 'node:perf_hooks';
import v8 from 'node:v8';

function p95(arr) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor(0.95 * (a.length - 1))];
}
const countHandles = () => ({
  handles: (process._getActiveHandles?.() ?? []).length,
  requests: (process._getActiveRequests?.() ?? []).length,
  kinds: process.getActiveResourcesInfo?.() ?? []
});
const heap = () => ({ ...process.memoryUsage(), v8: v8.getHeapStatistics() });

function expandEnv(obj) {
  const rx = /\$\{([^}:]+)(?::-(.*?))?\}/g; // ${VAR} or ${VAR:-default}
  const walk = (v) => {
    if (typeof v === 'string') {
      return v.replace(rx, (_, key, def) => {
        const val = process.env[key];
        return val !== undefined ? val : (def ?? '');
      });
    } else if (Array.isArray(v)) {
      return v.map(walk);
    } else if (v && typeof v === 'object') {
      const out = {};
      for (const k of Object.keys(v)) out[k] = walk(v[k]);
      return out;
    }
    return v;
  };
  return walk(obj);
}

async function runOne(label, config, enableStreamableTransport, sampleCount = 200) {
  const hubEntry = resolve(process.cwd(), 'packages/hub/dist/node-entry.js');
  const { createHub } = await import('file://' + hubEntry);

  const expanded = expandEnv(config);
  const hub = createHub({ preloadedConfig: { data: expanded }, enableStreamableTransport });
  const t0 = performance.now();
  await hub.start();
  const t1 = performance.now();
  const toolsRes = await hub.handleJsonRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const t2 = performance.now();

  const lat = [];
  for (let i = 0; i < sampleCount; i++) {
    const s0 = performance.now();
    await hub.resources.read('hatago://servers');
    lat.push(performance.now() - s0);
  }
  const out = {
    label,
    startup_ms: Math.round(t1 - t0),
    tools_list_ms: Math.round(t2 - t1),
    p95_servers_ms: Math.round(p95(lat)),
    handles: countHandles(),
    heap: heap(),
    tools_count: (toolsRes?.result?.tools ?? []).length
  };
  await hub.stop();
  return out;
}

(async () => {
  const cfgPath = process.argv[2];
  let repeats = 1;
  let samples = 200;
  // simple arg parse for --repeats / --samples
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--repeats') repeats = Number(process.argv[++i] ?? 1) || 1;
    if (process.argv[i] === '--samples') samples = Number(process.argv[++i] ?? 200) || 200;
  }

  if (!cfgPath || cfgPath.startsWith('--')) {
    console.error('Usage: node bench/local-hub-metrics.mjs /absolute/path/to/hatago.config.json');
    console.error('       [--repeats 5] [--samples 200]');
    process.exit(1);
  }
  const abs = isAbsolute(cfgPath) ? cfgPath : resolve(process.cwd(), cfgPath);
  const config = JSON.parse(readFileSync(abs, 'utf-8'));

  const quant = (arr) => {
    const a = [...arr].sort((x, y) => x - y);
    const q = (p) => a[Math.min(a.length - 1, Math.floor(p * (a.length - 1)))];
    return { p50: Math.round(q(0.5)), p95: Math.round(q(0.95)), p99: Math.round(q(0.99)) };
  };

  const runMany = async (label, sse) => {
    const starts = [];
    const tools = [];
    const servers = [];
    let last;
    for (let i = 0; i < repeats; i++) {
      last = await runOne(label, config, sse, samples);
      starts.push(last.startup_ms);
      tools.push(last.tools_list_ms);
      servers.push(last.p95_servers_ms);
    }
    return {
      label,
      summary: {
        startup_ms: quant(starts),
        tools_list_ms: quant(tools),
        p95_servers_ms: quant(servers)
      },
      lastRun: last
    };
  };

  const stdioLike = await runMany('stdioLike', false);
  const httpLike = await runMany('httpLike', true);
  console.log(JSON.stringify({ stdioLike, httpLike }, null, 2));
  // Ensure the process exits even if some benign timers remain
  setImmediate(() => process.exit(0));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
