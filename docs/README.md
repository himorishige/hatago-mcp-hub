# Hatago Documentation Index

This index curates the current documents and establishes single sources of truth. It also highlights overlaps to be trimmed in subsequent passes. [SD][DRY][CA]

## Language Policy

- Repository docs default to English. Keep root `README.md` in English.
- Provide `README.ja.md` as Japanese overview for the project.
- Public docs site (`apps/docs`) defaults to Japanese (primary JP reference), with optional English pages. [ISA]

## Canonical User Guide

- `packages/mcp-hub/README.md` — Primary, end‑user documentation for the `hatago` CLI and Hub features (quick start, transports, metrics, env‑file, MCP Inspector, configuration samples).

## Core References

- `docs/configuration.md` — Detailed configuration guide and advanced options.
- `docs/ARCHITECTURE.md` — High‑level design, components, data flow, security, and compliance notes.
- `docs/PERFORMANCE.md` — Benchmarks, optimization strategy, and operational guidance.
- `MIGRATION.md` — Breaking changes and refactor notes across versions.

## Package Docs

- `packages/core/README.md` — Types, RPC literals, dependency direction.
- `packages/runtime/README.md` — Session/registry/router runtime primitives.
- `packages/transport/README.md` — STDIO/HTTP/SSE transports and types.
- `packages/server/README.md` — Hub server runtime (programmatic entry).
- `packages/cli/README.md` — CLI surface (`serve`, `config`, `mcp`).

## Examples & Bench

- `examples/*` — Node and Workers examples, tag/inheritance configs.
- `bench/` — micro/realistic scenarios and measurement scripts.

## Public Docs Site

- `apps/docs/` (Astro Starlight) — Curated docs in EN/JA for publishing.

## De‑duplication Notes

- Root `README.md` and `packages/mcp-hub/README.md` currently duplicate: Features, `--env-file`, Metrics, MCP Inspector, and StreamableHTTP/HTTP explanations. Proposed: keep the canonical content in `packages/mcp-hub/README.md` and reduce root `README.md` to overview + links. [DRY][SF]
- PM2/nodemon guidance appears in root README and multiple docs. Keep the detailed how‑to only in `docs/configuration.md` and reference it elsewhere. [DRY]

## Style & Naming Consistency

- Package names must use the `@himorishige/` scope. Fixed in: runtime/cli/server READMEs. Sweep remaining content during cleanup. [ISA][CSD]

—

Maintainer note: This file is the entry point for docs maintenance. Update it when new docs are added or canonical locations change. [AC]
