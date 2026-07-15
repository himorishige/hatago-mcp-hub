/**
 * Aggregate per-server `instructions` into a single string that the hub returns
 * in its MCP `initialize` result. Clients (e.g. Claude Code) surface server
 * instructions at session start, so this is the hub's lever for pushing
 * routing/guidance text into the agent's context.
 *
 * Pure and dependency-injected (readFile / warn / log / isActive) so it can be
 * unit tested without a filesystem or a live hub.
 */
import { resolveWithin } from './path-guard.js';

/** A server's `instructions` config value: literal text or a file reference. */
export type InstructionsSource = string | { file: string };

type ServerConfigLike = Record<string, unknown> & { instructions?: InstructionsSource };

/**
 * Hard cap on the aggregated instructions. Claude Code truncates server
 * instructions at 2KB (and sees the hub as a single server), so exceeding this
 * silently loses guidance — we throw instead.
 */
export const INSTRUCTIONS_BYTE_LIMIT = 2048;

export function aggregateInstructions(
  mcpServers: Record<string, ServerConfigLike>,
  opts: {
    baseDir: string;
    isActive: (serverConfig: ServerConfigLike) => boolean;
    readFile: (path: string) => string;
    warn: (message: string) => void;
    log?: (message: string) => void;
  }
): string {
  const sections: string[] = [];

  for (const [id, cfg] of Object.entries(mcpServers)) {
    if (!opts.isActive(cfg)) continue;

    const src = cfg.instructions;
    if (src === undefined) continue;

    let text: string;
    if (typeof src === 'string') {
      text = src;
    } else {
      // Path containment (traversal/absolute escape), a missing/unreadable file,
      // or an oversized file all skip this server's instructions with a
      // diagnostic — one bad entry doesn't take down the hub. The out-of-tree
      // file is never read (resolveWithin throws before readFile). This mirrors
      // how a bad `skills` path degrades per-server.
      try {
        const resolvedPath = resolveWithin(
          opts.baseDir,
          src.file,
          `instructions.file for server '${id}'`
        );
        text = opts.readFile(resolvedPath);
      } catch (err) {
        opts.warn(
          `instructions: skipping server '${id}' (file '${src.file}') — ${
            err instanceof Error ? err.message : String(err)
          }`
        );
        continue;
      }
    }

    const trimmed = text.trim();
    if (trimmed.length === 0) continue;
    sections.push(`## ${id}\n${trimmed}`);
  }

  const result = sections.join('\n\n');

  const bytes = Buffer.byteLength(result, 'utf-8');
  if (bytes > INSTRUCTIONS_BYTE_LIMIT) {
    throw new Error(
      `instructions: aggregated size ${bytes} bytes exceeds the ${INSTRUCTIONS_BYTE_LIMIT}-byte limit ` +
        `(clients such as Claude Code truncate server instructions at 2KB). Shorten the per-server instructions.`
    );
  }

  if (result.length > 0) {
    opts.log?.(`instructions: aggregated ${sections.length} server section(s), ${bytes} bytes`);
  }

  return result;
}
