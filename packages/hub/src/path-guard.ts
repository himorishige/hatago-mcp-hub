import { resolve, sep } from 'node:path';

/**
 * Resolve `target` against `baseDir` and assert the result stays within `baseDir`.
 * Rejects `..` traversal and absolute paths that escape the config directory, so a
 * config value can never read files outside the config tree. Throws on violation.
 *
 * @param label short context for the error message (e.g. "skills path for server X")
 */
export function resolveWithin(baseDir: string, target: string, label: string): string {
  const base = resolve(baseDir);
  const resolved = resolve(base, target);
  if (resolved !== base && !resolved.startsWith(base + sep)) {
    throw new Error(
      `${label}: '${target}' resolves to '${resolved}', which is outside the config directory '${base}'. Paths must stay within the config directory.`
    );
  }
  return resolved;
}
