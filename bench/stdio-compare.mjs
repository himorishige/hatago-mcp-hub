#!/usr/bin/env node
/* global process, console, setTimeout, clearTimeout */
/**
 * STDIO benchmark: local (working tree) vs npm release.
 * Measures startup → tools/list and p95 of hatago://servers read.
 */

import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

async function loadCoreConstants() {
  // Read constants directly from source to avoid build dependency. [SF][DM]
  try {
    const here = fileURLToPath(new URL('.', import.meta.url));
    const repo = resolve(here, '..');
    const constantsPath = resolve(repo, 'packages/core/src/constants.ts');
    if (!existsSync(constantsPath)) throw new Error('constants.ts not found');
    const text = readFileSync(constantsPath, 'utf-8');
    const ver = /export const HATAGO_VERSION\s*=\s*['"]([^'"]+)['"]/m.exec(text)?.[1];
    const proto = /export const HATAGO_PROTOCOL_VERSION\s*=\s*['"]([^'"]+)['"]/m.exec(text)?.[1];
    return {
      version: ver ?? '0.0.11',
      protocolVersion: proto ?? '2025-06-18'
    };
  } catch {
    return { version: '0.0.11', protocolVersion: '2025-06-18' };
  }
}

function parseArgs(argv, defaults) {
  const out = { npm: defaults.npm, iters: 200, envFile: undefined, config: undefined };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--npm') out.npm = argv[++i];
    else if (a === '--iters') out.iters = Number(argv[++i] ?? 200) || 200;
    else if (a === '--env-file') out.envFile = argv[++i];
    else if (a === '--config') out.config = argv[++i];
    else if (!out.config) out.config = a;
  }
  if (!out.config)
    throw new Error(
      `Usage: node bench/stdio-compare.mjs --config <path> [--npm ${defaults.npm}] [--iters 200] [--env-file ./.env]`
    );
  out.config = isAbsolute(out.config) ? out.config : resolve(process.cwd(), out.config);
  if (!existsSync(out.config)) throw new Error(`Config not found: ${out.config}`);
  return out;
}

function p95(arr) {
  const a = [...arr].sort((x, y) => x - y);
  return a[Math.floor(0.95 * (a.length - 1))];
}

function loadEnvFile(path) {
  const text = readFileSync(path, 'utf-8');
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const m = line.match(/^export\s+([^=]+)=(.*)$/) || line.match(/^([^=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    val = val.replaceAll('\\n', '\n').replaceAll('\\r', '\r').replaceAll('\\t', '\t');
    out[key] = val;
  }
  return out;
}

async function runStdio(label, cmd, args, opts) {
  // Use piped stderr to avoid noisy EPIPE from child processes on shutdown.
  const child = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'], env: opts.env });
  const rss = () => Number(execSync(`ps -o rss= -p ${child.pid}`).toString().trim());
  const t0 = performance.now();

  const send = (obj) => child.stdin.write(JSON.stringify(obj) + '\n');
  const once = (predicate, timeoutMs = 15000) =>
    new Promise((resolve, reject) => {
      let timeout;
      const onData = (buf) => {
        const lines = buf.toString().split('\n').filter(Boolean);
        for (const line of lines) {
          try {
            const msg = JSON.parse(line);
            if (predicate(msg)) {
              clearTimeout(timeout);
              child.stdout.off('data', onData);
              return resolve(msg);
            }
          } catch {
            /* ignore logs and partials */
          }
        }
      };
      timeout = setTimeout(() => {
        child.stdout.off('data', onData);
        reject(new Error('timeout'));
      }, timeoutMs);
      child.stdout.on('data', onData);
    });

  // Initialize and list tools
  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: opts.protocolVersion,
      capabilities: {},
      clientInfo: { name: 'bench', version: '1' }
    }
  });
  send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
  await once((m) => m?.id === 2 && (m.result?.tools || m.error));
  const t1 = performance.now();
  const startup_ms = Math.round(t1 - t0);
  const rss_kb = rss();

  // Sample hatago://servers
  const lat = [];
  for (let i = 0; i < opts.iters; i++) {
    const id = 10 + i;
    const s0 = performance.now();
    send({ jsonrpc: '2.0', id, method: 'resources/read', params: { uri: 'hatago://servers' } });
    await once((m) => m?.id === id && (m.result?.contents || m.error), 15000);
    lat.push(performance.now() - s0);
  }
  const p95_ms = Math.round(p95(lat));

  // Terminate gracefully: SIGINT then wait for close
  try {
    child.kill('SIGINT');
  } catch (e) {
    void e;
  }
  await new Promise((resolve) => child.once('close', resolve));
  return { label, startup_ms, rss_kb, p95_servers_ms: p95_ms };
}

(async () => {
  const c = await loadCoreConstants();
  const args = parseArgs(process.argv, { npm: c.version });
  const localCli = resolve(process.cwd(), 'packages/mcp-hub/dist/node/cli.js');
  if (!existsSync(localCli)) {
    console.error('Local CLI not found. Run: pnpm -r build');
    process.exit(1);
  }
  const base = ['serve', '--stdio', '--config', args.config];
  const extraEnv = args.envFile ? loadEnvFile(args.envFile) : {};
  const env = { ...process.env, ...extraEnv };

  const local = await runStdio('local-refactor', 'node', [localCli, ...base], {
    iters: args.iters,
    env,
    protocolVersion: c.protocolVersion
  });
  const npmArgs = [
    '-y',
    `@himorishige/hatago-mcp-hub@${args.npm}`,
    'serve',
    '--stdio',
    '--config',
    args.config
  ];
  const npm = await runStdio(`npm@${args.npm}`, 'npx', npmArgs, {
    iters: args.iters,
    env,
    protocolVersion: c.protocolVersion
  });

  console.log(JSON.stringify({ local, npm }, null, 2));
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
