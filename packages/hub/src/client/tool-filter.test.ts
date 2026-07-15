/**
 * Tests for per-server tool filtering and overrides
 * (config `tools.include` / `tools.exclude` / `tools.overrides`)
 */

import { describe, it, expect } from 'vitest';
import { ServerConfigSchema } from '@himorishige/hatago-core';
import { applyDescriptionTemplate, filterToolsByName } from './registrar.js';

const tools = [{ name: 'a' }, { name: 'b' }, { name: 'c' }];

describe('filterToolsByName', () => {
  it('returns all tools when no filter is provided', () => {
    expect(filterToolsByName(tools)).toEqual(tools);
    expect(filterToolsByName(tools, {})).toEqual(tools);
  });

  it('keeps only included tools', () => {
    expect(filterToolsByName(tools, { include: ['a', 'c'] }).map((t) => t.name)).toEqual([
      'a',
      'c'
    ]);
  });

  it('drops excluded tools', () => {
    expect(filterToolsByName(tools, { exclude: ['b'] }).map((t) => t.name)).toEqual(['a', 'c']);
  });

  it('applies exclude after include (exclude wins)', () => {
    expect(
      filterToolsByName(tools, { include: ['a', 'b'], exclude: ['b'] }).map((t) => t.name)
    ).toEqual(['a']);
  });

  it('treats empty arrays as no-op', () => {
    expect(filterToolsByName(tools, { include: [], exclude: [] })).toEqual(tools);
  });
});

describe('applyDescriptionTemplate', () => {
  it('returns the original description when no template is given', () => {
    expect(applyDescriptionTemplate(undefined, 'Original')).toBe('Original');
  });

  it('treats an empty-string template as "leave unchanged", not "erase"', () => {
    expect(applyDescriptionTemplate('', 'Original')).toBe('Original');
  });

  it('expands {description} to the upstream description (augment)', () => {
    expect(applyDescriptionTemplate('For CUSTOMER. {description}', 'Create a page')).toBe(
      'For CUSTOMER. Create a page'
    );
  });

  it('replaces fully when the template has no placeholder', () => {
    expect(applyDescriptionTemplate('Brand new text', 'Original')).toBe('Brand new text');
  });

  it('treats a missing upstream description as empty when expanding', () => {
    expect(applyDescriptionTemplate('Prefix: {description}', undefined)).toBe('Prefix: ');
  });
});

describe('ServerConfig schema accepts tools filter', () => {
  it('parses include/exclude on a server', () => {
    const parsed = ServerConfigSchema.parse({
      url: 'https://example.com/mcp',
      type: 'sse',
      tools: { include: ['getJiraIssue'], exclude: ['deleteJiraIssue'] }
    });
    expect(parsed.tools).toEqual({ include: ['getJiraIssue'], exclude: ['deleteJiraIssue'] });
  });

  it('parses per-tool overrides', () => {
    const parsed = ServerConfigSchema.parse({
      url: 'https://example.com/mcp',
      type: 'sse',
      tools: {
        overrides: {
          createConfluencePage: {
            name: 'create_customer_page',
            description: 'For the CUSTOMER Confluence. {description}'
          },
          searchConfluence: { description: 'Search the CUSTOMER Confluence.' }
        }
      }
    });
    expect(parsed.tools?.overrides?.createConfluencePage).toEqual({
      name: 'create_customer_page',
      description: 'For the CUSTOMER Confluence. {description}'
    });
    expect(parsed.tools?.overrides?.searchConfluence).toEqual({
      description: 'Search the CUSTOMER Confluence.'
    });
  });

  it('rejects unknown keys inside tools', () => {
    expect(() =>
      ServerConfigSchema.parse({
        command: 'echo',
        tools: { only: ['a'] }
      })
    ).toThrow();
  });

  it('rejects unknown keys inside an override entry', () => {
    expect(() =>
      ServerConfigSchema.parse({
        command: 'echo',
        tools: { overrides: { foo: { title: 'nope' } } }
      })
    ).toThrow();
  });
});
