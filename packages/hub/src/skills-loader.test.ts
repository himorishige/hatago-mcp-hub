import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { parseSkillFile, loadSkills } from './skills-loader.js';
import type { SkillEntry } from './skills-loader.js';

// --- helpers ----------------------------------------------------------------

function makeLogger() {
  const calls: Array<{ msg: string; data: unknown }> = [];
  return {
    warn(m: string, d?: unknown) {
      calls.push({ msg: m, data: d });
    },
    calls
  };
}

const VALID_CONTENT = `---
name: my-skill
description: Does something useful
---
# My Skill

Body content here.
`;

// --- parseSkillFile ---------------------------------------------------------

describe('parseSkillFile', () => {
  it('parses valid frontmatter and body into a SkillEntry', () => {
    const logger = makeLogger();
    const result = parseSkillFile('/fake/my-skill.md', VALID_CONTENT, logger);

    expect(result).not.toBeNull();
    const entry = result as SkillEntry;
    expect(entry.name).toBe('my-skill');
    expect(entry.description).toBe('Does something useful');
    expect(entry.body).toBe('# My Skill\n\nBody content here.\n');
    expect(logger.calls).toHaveLength(0);
  });

  it('returns null and warns when no --- delimiters are present', () => {
    const logger = makeLogger();
    const content = 'name: foo\ndescription: bar\nno delimiters here';
    const result = parseSkillFile('/fake/bad.md', content, logger);

    expect(result).toBeNull();
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]!.msg).toContain('/fake/bad.md');
  });

  it('returns null and warns when only one --- delimiter is present', () => {
    const logger = makeLogger();
    const content = '---\nname: foo\ndescription: bar\n';
    const result = parseSkillFile('/fake/one-delim.md', content, logger);

    expect(result).toBeNull();
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]!.msg).toContain('/fake/one-delim.md');
  });

  it('returns null and warns when name field is missing', () => {
    const logger = makeLogger();
    const content = `---\ndescription: A description\n---\nBody\n`;
    const result = parseSkillFile('/fake/no-name.md', content, logger);

    expect(result).toBeNull();
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]!.msg).toContain('/fake/no-name.md');
  });

  it('returns null and warns when description field is missing', () => {
    const logger = makeLogger();
    const content = `---\nname: my-skill\n---\nBody\n`;
    const result = parseSkillFile('/fake/no-desc.md', content, logger);

    expect(result).toBeNull();
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]!.msg).toContain('/fake/no-desc.md');
  });
});

// --- loadSkills -------------------------------------------------------------

describe('loadSkills', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `skills-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it('returns [] when the directory does not exist (no throw)', async () => {
    const logger = makeLogger();
    const result = await loadSkills('/nonexistent/path/that/does/not/exist', logger);

    expect(result).toEqual([]);
    expect(logger.calls).toHaveLength(0);
  });

  it('skips non-.md files in the directory', async () => {
    const logger = makeLogger();
    await writeFile(join(tmpDir, 'readme.txt'), 'not markdown');
    await writeFile(join(tmpDir, 'data.json'), '{}');

    const result = await loadSkills(tmpDir, logger);
    expect(result).toEqual([]);
  });

  it('skips a malformed file and still returns valid entries', async () => {
    const logger = makeLogger();
    await writeFile(join(tmpDir, 'broken.md'), 'no frontmatter delimiters');
    await writeFile(join(tmpDir, 'valid.md'), VALID_CONTENT);

    const result = await loadSkills(tmpDir, logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('my-skill');
    expect(logger.calls).toHaveLength(1);
  });

  it('loads directory-per-skill layout (<name>/SKILL.md)', async () => {
    const logger = makeLogger();
    const skillDir = join(tmpDir, 'kb-router');
    await mkdir(skillDir, { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---\nname: kb-router\ndescription: Routes questions to the knowledge base\n---\nRouting body\n`
    );

    const result = await loadSkills(tmpDir, logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('kb-router');
    expect(logger.calls).toHaveLength(0);
  });

  it('bundles companion files for directory-per-skill (recursive, text-only)', async () => {
    const logger = makeLogger();
    const skillDir = join(tmpDir, 'kb-router');
    await mkdir(join(skillDir, 'references'), { recursive: true });
    await writeFile(
      join(skillDir, 'SKILL.md'),
      `---\nname: kb-router\ndescription: Routes questions\n---\nBody\n`
    );
    await writeFile(join(skillDir, 'routing-index.json'), '{"a":1}');
    await writeFile(join(skillDir, 'references', 'notes.md'), '# Notes');
    await writeFile(join(skillDir, 'logo.png'), 'binary-ish'); // non-text → skipped + warned

    const result = await loadSkills(tmpDir, logger);

    expect(result).toHaveLength(1);
    const files = result[0]!.files;
    const byPath = Object.fromEntries(files.map((f) => [f.path, f]));
    expect(Object.keys(byPath).sort()).toEqual(['references/notes.md', 'routing-index.json']);
    expect(byPath['routing-index.json']!.mimeType).toBe('application/json');
    expect(byPath['routing-index.json']!.content).toBe('{"a":1}');
    expect(byPath['references/notes.md']!.mimeType).toBe('text/markdown');
    expect(logger.calls).toHaveLength(1);
    expect(logger.calls[0]!.msg).toContain('logo.png');
  });

  it('returns an empty files list for the flat <name>.md layout', async () => {
    const logger = makeLogger();
    await writeFile(join(tmpDir, 'flat.md'), VALID_CONTENT);

    const result = await loadSkills(tmpDir, logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.files).toEqual([]);
  });

  it('follows a symlinked skill directory', async () => {
    const logger = makeLogger();
    const realDir = join(tmpDir, 'real-kb');
    await mkdir(realDir, { recursive: true });
    await writeFile(
      join(realDir, 'SKILL.md'),
      `---\nname: linked-skill\ndescription: via symlink\n---\nBody\n`
    );
    const linkDir = join(tmpDir, 'skills-dir');
    await mkdir(linkDir, { recursive: true });
    await symlink(realDir, join(linkDir, 'kb'), 'dir');

    const result = await loadSkills(linkDir, logger);

    expect(result).toHaveLength(1);
    expect(result[0]!.name).toBe('linked-skill');
    expect(logger.calls).toHaveLength(0);
  });

  it('ignores a subdirectory that has no SKILL.md', async () => {
    const logger = makeLogger();
    await mkdir(join(tmpDir, 'not-a-skill'), { recursive: true });
    await writeFile(join(tmpDir, 'not-a-skill', 'other.md'), VALID_CONTENT);

    const result = await loadSkills(tmpDir, logger);

    expect(result).toEqual([]);
    expect(logger.calls).toHaveLength(0);
  });

  it('loads multiple valid files and returns all entries', async () => {
    const logger = makeLogger();
    const skill1 = `---\nname: skill-one\ndescription: First skill\n---\nBody one\n`;
    const skill2 = `---\nname: skill-two\ndescription: Second skill\n---\nBody two\n`;

    await writeFile(join(tmpDir, 'skill-one.md'), skill1);
    await writeFile(join(tmpDir, 'skill-two.md'), skill2);

    const result = await loadSkills(tmpDir, logger);

    expect(result).toHaveLength(2);
    const names = result.map((e) => e.name).sort();
    expect(names).toEqual(['skill-one', 'skill-two']);
    expect(logger.calls).toHaveLength(0);
  });
});
