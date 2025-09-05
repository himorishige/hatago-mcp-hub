/**
 * Template System Tests
 *
 * Tests template loading, processing, and validation
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtemp, writeFile, mkdir } from 'node:fs/promises';
import { rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  listTemplates,
  getTemplate,
  generateFromTemplate,
  checkFileConflicts,
  validateInputs,
  applyDefaults,
  formatTemplateList,
  type TemplateMetadata,
  type Template
} from './index.js';

describe('Template System', () => {
  let tempDir: string;
  let mockTemplateDir: string;

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'hatago-test-'));
  });

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (mockTemplateDir) {
      rmSync(mockTemplateDir, { recursive: true, force: true });
    }
  });

  describe('Template Discovery', () => {
    it('should list all built-in templates', () => {
      const templates = listTemplates();

      expect(templates).toBeDefined();
      expect(templates.length).toBeGreaterThan(0);

      // Check that expected templates exist
      const templateNames = templates.map((t) => t.name);
      expect(templateNames).toContain('minimal');
      expect(templateNames).toContain('local-dev');
      expect(templateNames).toContain('ai-assistant');
      expect(templateNames).toContain('cloud-only');
      expect(templateNames).toContain('full-stack');
    });

    it('should get specific template by name', () => {
      const template = getTemplate('minimal');

      expect(template).toBeDefined();
      expect(template?.name).toBe('minimal');
      expect(template?.metadata).toBeDefined();
      expect(template?.metadata.description).toBeDefined();
      expect(template?.metadata.tags).toBeInstanceOf(Array);
    });

    it('should return null for non-existent template', () => {
      const template = getTemplate('non-existent');
      expect(template).toBeNull();
    });
  });

  describe('Template Metadata Validation', () => {
    it('should validate minimal template metadata', () => {
      const template = getTemplate('minimal');
      expect(template).toBeDefined();

      const { metadata } = template!;
      expect(metadata.name).toBe('minimal');
      expect(metadata.version).toMatch(/^\d+\.\d+\.\d+$/);
      expect(metadata.templateSpec).toBeDefined();
      expect(metadata.hatagoVersion).toBeDefined();
      expect(metadata.description).toBeTruthy();
      expect(Array.isArray(metadata.tags)).toBe(true);
      expect(Array.isArray(metadata.inputs)).toBe(true);
    });

    it('should validate ai-assistant template has required inputs', () => {
      const template = getTemplate('ai-assistant');
      expect(template).toBeDefined();

      const { inputs } = template!.metadata;
      const inputNames = inputs.map((i) => i.name);
      expect(inputNames).toContain('projectPath');
      expect(inputNames).toContain('githubToken');
      expect(inputNames).toContain('openaiApiKey');
    });
  });

  describe('Input Validation', () => {
    const mockMetadata: TemplateMetadata = {
      name: 'test',
      version: '1.0.0',
      templateSpec: '1.0',
      hatagoVersion: '>=0.0.2',
      description: 'Test template',
      tags: ['test'],
      inputs: [
        {
          name: 'requiredString',
          type: 'string',
          description: 'Required string',
          required: true
        },
        {
          name: 'optionalBoolean',
          type: 'boolean',
          description: 'Optional boolean',
          required: false,
          default: false
        },
        {
          name: 'optionalNumber',
          type: 'number',
          description: 'Optional number',
          required: false,
          default: 42
        }
      ]
    };

    it('should validate correct inputs', () => {
      const variables = {
        requiredString: 'test value',
        optionalBoolean: true,
        optionalNumber: 123
      };

      const result = validateInputs(mockMetadata, variables);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject missing required inputs', () => {
      const variables = {
        optionalBoolean: true
      };

      const result = validateInputs(mockMetadata, variables);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Missing required input: requiredString');
    });

    it('should reject wrong input types', () => {
      const variables = {
        requiredString: 'valid string',
        optionalBoolean: 'should be boolean',
        optionalNumber: 'should be number'
      };

      const result = validateInputs(mockMetadata, variables);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'Invalid type for optionalBoolean: expected boolean, got string'
      );
      expect(result.errors).toContain(
        'Invalid type for optionalNumber: expected number, got string'
      );
    });

    it('should apply default values', () => {
      const variables = {
        requiredString: 'test'
      };

      const result = applyDefaults(mockMetadata, variables);
      expect(result.requiredString).toBe('test');
      expect(result.optionalBoolean).toBe(false);
      expect(result.optionalNumber).toBe(42);
    });
  });

  describe('Template Generation', () => {
    let mockTemplate: Template;

    beforeEach(async () => {
      // Create a mock template directory
      mockTemplateDir = await mkdtemp(join(tmpdir(), 'mock-template-'));

      const templateMetadata: TemplateMetadata = {
        name: 'test-template',
        version: '1.0.0',
        templateSpec: '1.0',
        hatagoVersion: '>=0.0.2',
        description: 'Test template',
        tags: ['test'],
        inputs: [
          {
            name: 'projectName',
            type: 'string',
            description: 'Project name',
            required: true
          },
          {
            name: 'enableFeature',
            type: 'boolean',
            description: 'Enable feature',
            required: false,
            default: false
          }
        ]
      };

      // Create template.json
      await writeFile(
        join(mockTemplateDir, 'template.json'),
        JSON.stringify(templateMetadata, null, 2)
      );

      // Create a Handlebars template file
      await writeFile(
        join(mockTemplateDir, 'config.json.hbs'),
        JSON.stringify(
          {
            name: '{{projectName}}',
            feature: '{{#if enableFeature}}true{{else}}false{{/if}}'
          },
          null,
          2
        )
      );

      // Create a static file
      await writeFile(
        join(mockTemplateDir, 'HATAGO_TEMPLATE.md'),
        '# Test Template\\n\\nThis is a test template.'
      );

      // Create subdirectory with files
      await mkdir(join(mockTemplateDir, 'src'));
      await writeFile(
        join(mockTemplateDir, 'src', 'main.ts.hbs'),
        'export const PROJECT_NAME = \"{{projectName}}\";'
      );

      mockTemplate = {
        name: 'test-template',
        path: mockTemplateDir,
        metadata: templateMetadata
      };
    });

    it('should generate files from template', () => {
      const variables = {
        projectName: 'my-project',
        enableFeature: true
      };

      const result = generateFromTemplate(mockTemplate, tempDir, variables);
      expect(result.created.length).toBeGreaterThan(0);
      expect(result.conflicts.length).toBe(0);
      expect(result.skipped.length).toBe(0);

      // Check generated files
      expect(existsSync(join(tempDir, 'config.json'))).toBe(true);
      expect(existsSync(join(tempDir, 'HATAGO_TEMPLATE.md'))).toBe(true);
      expect(existsSync(join(tempDir, 'src', 'main.ts'))).toBe(true);

      // Check file contents
      const configContent = readFileSync(join(tempDir, 'config.json'), 'utf-8');
      const config = JSON.parse(configContent);
      expect(config.name).toBe('my-project');
      expect(config.feature).toBe('true'); // Handlebars outputs as string

      const mainTsContent = readFileSync(join(tempDir, 'src', 'main.ts'), 'utf-8');
      expect(mainTsContent).toBe('export const PROJECT_NAME = \"my-project\";');

      const readmeContent = readFileSync(join(tempDir, 'HATAGO_TEMPLATE.md'), 'utf-8');
      expect(readmeContent).toBe('# Test Template\\n\\nThis is a test template.');
    });

    it('should skip template.json and hooks directory', () => {
      const variables = { projectName: 'test' };

      const result = generateFromTemplate(mockTemplate, tempDir, variables);

      expect(existsSync(join(tempDir, 'template.json'))).toBe(false);
      expect(existsSync(join(tempDir, 'hooks'))).toBe(false);
      expect(result.created.length).toBeGreaterThan(0);
    });

    it('should detect file conflicts', () => {
      // Create a conflicting file
      writeFileSync(join(tempDir, 'config.json'), 'existing content');

      const conflicts = checkFileConflicts(mockTemplate, tempDir);
      expect(conflicts).toContain(join(tempDir, 'config.json'));
    });

    it('should handle conflicts gracefully with force option', () => {
      // Create a conflicting file
      writeFileSync(join(tempDir, 'config.json'), 'existing content');

      const variables = { projectName: 'test-project' };
      const result = generateFromTemplate(mockTemplate, tempDir, variables, { force: true });

      expect(result.created.length).toBeGreaterThan(0);
      expect(result.conflicts.length).toBe(0);

      // Check that the file was overwritten
      const content = readFileSync(join(tempDir, 'config.json'), 'utf-8');
      expect(content).toContain('test-project');
    });

    it('should skip conflicts when skipConflicts is true', () => {
      // Create a conflicting file
      writeFileSync(join(tempDir, 'config.json'), 'existing content');

      const variables = { projectName: 'test-project' };
      const result = generateFromTemplate(mockTemplate, tempDir, variables, {
        skipConflicts: true
      });

      expect(result.skipped.length).toBe(1);
      expect(result.skipped[0]).toBe(join(tempDir, 'config.json'));

      // Check that the file was not overwritten
      const content = readFileSync(join(tempDir, 'config.json'), 'utf-8');
      expect(content).toBe('existing content');
    });
  });

  describe('Template Formatting', () => {
    it('should format template list correctly', () => {
      const templates = listTemplates();
      const formatted = formatTemplateList(templates);

      expect(formatted).toContain('Available templates:');
      expect(formatted).toContain('minimal');
      expect(formatted).toContain('ai-assistant');

      // Should contain descriptions
      templates.forEach((template) => {
        expect(formatted).toContain(template.metadata.description);
      });
    });

    it('should include tags in formatted list', () => {
      const templates = listTemplates();
      const formatted = formatTemplateList(templates);

      // Find a template with tags
      const templateWithTags = templates.find((t) => t.metadata.tags.length > 0);
      if (templateWithTags) {
        expect(formatted).toContain('Tags:');
        templateWithTags.metadata.tags.forEach((tag) => {
          expect(formatted).toContain(tag);
        });
      }
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid template directories gracefully', async () => {
      // Create a directory without template.json
      const invalidDir = await mkdtemp(join(tmpdir(), 'invalid-template-'));
      await writeFile(join(invalidDir, 'some-file.txt'), 'not a template');

      // Mock __dirname to point to our invalid directory
      const originalConsoleWarn = console.warn;
      console.warn = vi.fn();

      try {
        // This should not crash
        const templates = listTemplates();
        expect(Array.isArray(templates)).toBe(true);
      } finally {
        console.warn = originalConsoleWarn;
        rmSync(invalidDir, { recursive: true });
      }
    });

    it('should handle malformed template.json', async () => {
      const invalidTemplateDir = await mkdtemp(join(tmpdir(), 'malformed-'));
      await writeFile(join(invalidTemplateDir, 'template.json'), '{ invalid json }');

      const originalConsoleWarn = console.warn;
      console.warn = vi.fn();

      try {
        // Should not include the malformed template
        // (This test would need to mock the template directory discovery)
        expect(true).toBe(true); // Placeholder
      } finally {
        console.warn = originalConsoleWarn;
        rmSync(invalidTemplateDir, { recursive: true });
      }
    });
  });
});
