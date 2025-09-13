# Hatago Hub Benchmarks

This folder contains small, dependency‑free scripts to benchmark Hatago MCP Hub.

Goals:

- Compare local (refactored) hub vs a released npm version in STDIO mode.
- Inspect local hub internals (heap/handles) without any external tools.

> Prereqs: `pnpm -r build` to generate local dist files.

## 1) STDIO compare (local vs npm)

Runs both hubs as standalone STDIO servers and measures:

- startup_ms: process start → `tools/list` response
- p95_servers_ms: p95 latency of `resources/read` for `hatago://servers`
- rss_kb: OS RSS after `tools/list` (rough memory proxy)

Usage:

```bash
node bench/stdio-compare.mjs \
  --config /absolute/path/to/hatago.config.json \
  --npm 0.0.13 \
  --iters 200 \
  [--env-file /path/to/.env]
```

Notes:

- The npm version is spawned via `npx @himorishige/hatago-mcp-hub@<ver>`. If you prefer, preinstall globally and replace the runner inside the script.
- `--env-file` is optional and forwarded to both runs.

## 2) Local hub internals (heap/handles)

Launches the local hub in‑process (no HTTP listener) and collects:

- startup_ms, tools_list_ms, p95 of `hatago://servers`
- `process._getActiveHandles()` / `_getActiveRequests()` counts (best‑effort)
- `process.memoryUsage()` and `v8.getHeapStatistics()`

Usage:

```bash
node bench/local-hub-metrics.mjs /absolute/path/to/hatago.config.json
```

This prints two snapshots:

- `stdioLike` → internal StreamableHTTP disabled (closest to STDIO)
- `httpLike` → internal StreamableHTTP enabled (closest to HTTP)

You can diff these results to validate the impact of the refactor.

- Quick configs
  - Empty hub: `bench/configs/hatago-empty.config.json`
  - Deterministic fixture (no network): `bench/configs/hatago-fixture.config.json` (optionally set `FIXTURE_JS` env; defaults to `./packages/test-fixtures/dist/stdio-server.js`)
  - NPX everything: `bench/configs/hatago-everything.config.json`

Example calls

```bash
# Pure hub (no servers)
node bench/stdio-compare.mjs --config bench/configs/hatago-empty.config.json --npm 0.0.13 --iters 200

# Deterministic (local fixture)
node bench/stdio-compare.mjs --config bench/configs/hatago-fixture.config.json --npm 0.0.13 --iters 200

# Realistic (npx everything)
node bench/stdio-compare.mjs --config bench/configs/hatago-everything.config.json --npm 0.0.13 --iters 200
```
