import { readdir, readFile, stat } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { join } from 'node:path';

// The skill:// URI is server-scoped and assembled by the hub (skill://<serverId>/<name>),
// so it is intentionally not part of SkillEntry.
export type SkillEntry = {
  name: string;
  description: string;
  body: string;
  // Companion files bundled alongside SKILL.md (directory-per-skill layout only).
  // Empty for the flat <name>.md layout. Relative path preserved for the URI.
  files: SkillFile[];
};

// A skill resource body as served on the read path, keyed by skill:// URI.
export type SkillBody = {
  text: string;
  mimeType: string;
};

// A non-SKILL.md file bundled in a skill directory, exposed as
// skill://<serverId>/<name>/<path>.
export type SkillFile = {
  path: string; // relative to the skill dir, e.g. "routing-index.json" or "references/x.md"
  content: string;
  mimeType: string;
};

// Text file extensions we serve as companion resources. Kept text-only on
// purpose: the read path returns `text`, so binary would corrupt. Anything not
// listed here is skipped with a warning rather than mangled.
const MIME_BY_EXT: Record<string, string> = {
  '.md': 'text/markdown',
  '.markdown': 'text/markdown',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.tsv': 'text/tab-separated-values',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.toml': 'application/toml',
  '.xml': 'application/xml',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.cjs': 'text/javascript',
  '.ts': 'text/plain',
  '.py': 'text/x-python',
  '.sh': 'application/x-sh'
};

function mimeForFile(name: string): string | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return MIME_BY_EXT[name.slice(dot).toLowerCase()] ?? null;
}

const DELIMITER_RE = /^---\s*$/m;
const FIELD_RE = /^(\w+):\s*(.*)$/;

export function parseSkillFile(
  filePath: string,
  content: string,
  logger: { warn: (m: string, d?: unknown) => void }
): SkillEntry | null {
  const parts = content.split(DELIMITER_RE);
  if (parts.length < 3) {
    logger.warn(`skills-loader: missing frontmatter delimiters in ${filePath}`);
    return null;
  }

  const frontmatter = parts[1] as string;
  const body = parts.slice(2).join('---').replace(/^\n/, '');

  const fields: Record<string, string> = {};
  for (const line of frontmatter.split('\n')) {
    const m = line.match(FIELD_RE);
    if (m?.[1] && m[2] !== undefined) {
      fields[m[1]] = m[2].trim();
    }
  }

  if (!fields['name']) {
    logger.warn(`skills-loader: missing 'name' field in ${filePath}`);
    return null;
  }
  if (!fields['description']) {
    logger.warn(`skills-loader: missing 'description' field in ${filePath}`);
    return null;
  }

  return {
    name: fields['name'],
    description: fields['description'],
    body,
    files: []
  };
}

// Recursively collect text companion files under a skill directory (excluding
// its own SKILL.md). Paths are returned relative to `dir` with '/' separators so
// they slot into skill://<serverId>/<name>/<path>. Symlinked subdirectories are
// not followed, to avoid cycles.
async function collectSkillFiles(
  dir: string,
  logger: { warn: (m: string, d?: unknown) => void }
): Promise<SkillFile[]> {
  const out: SkillFile[] = [];

  async function walk(current: string, relBase: string): Promise<void> {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      const rel = relBase ? `${relBase}/${entry.name}` : entry.name;
      if (rel === 'SKILL.md') continue; // the skill body, served as skill://.../<name>
      if (entry.isDirectory()) {
        await walk(join(current, entry.name), rel);
        continue;
      }
      if (!entry.isFile()) continue; // skip symlinks/sockets/etc.
      const mimeType = mimeForFile(entry.name);
      if (mimeType === null) {
        logger.warn(`skills-loader: skipping non-text companion file ${rel}`);
        continue;
      }
      const content = await readFile(join(current, entry.name), 'utf-8');
      out.push({ path: rel, content, mimeType });
    }
  }

  await walk(dir, '');
  return out;
}

export async function loadSkills(
  dir: string,
  logger: { warn: (m: string, d?: unknown) => void }
): Promise<SkillEntry[]> {
  let entries: Dirent[];
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }

  // Two supported layouts:
  //  - flat: <dir>/<name>.md (no companion files)
  //  - directory-per-skill: <dir>/<name>/SKILL.md (Claude Code convention);
  //    every other file in <name>/ is bundled as a companion resource.
  const skillFiles: Array<{ file: string; dir?: string }> = [];
  for (const entry of entries) {
    const full = join(dir, entry.name);
    let isFile = entry.isFile();
    let isDir = entry.isDirectory();
    // Follow symlinks: a Dirent for a symlink reports neither isFile nor
    // isDirectory, so resolve the target to support linked skills.
    if (entry.isSymbolicLink()) {
      try {
        const target = await stat(full);
        isFile = target.isFile();
        isDir = target.isDirectory();
      } catch {
        continue; // broken symlink — skip
      }
    }
    if (isFile && entry.name.endsWith('.md')) {
      skillFiles.push({ file: full });
    } else if (isDir) {
      skillFiles.push({ file: join(full, 'SKILL.md'), dir: full });
    }
  }

  const skills: SkillEntry[] = [];
  for (const { file: filePath, dir: skillDir } of skillFiles) {
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (err: unknown) {
      // A subdirectory without a SKILL.md is not a skill; skip silently.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') continue;
      throw err;
    }
    const skill = parseSkillFile(filePath, content, logger);
    if (skill !== null) {
      if (skillDir) skill.files = await collectSkillFiles(skillDir, logger);
      skills.push(skill);
    }
  }

  return skills;
}
