/**
 * Template Loader Module
 *
 * Handles template discovery, loading, and processing for Hatago init command
 */

import {
  readFileSync,
  existsSync,
  readdirSync,
  statSync,
  mkdirSync,
  writeFileSync,
  copyFileSync
} from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import Handlebars from 'handlebars';

// Get templates directory path - handle both development and built versions
function getTemplatesDir(): string {
  const currentDir = dirname(fileURLToPath(import.meta.url));

  // In built version, templates are at dist/templates
  // In development, templates are at src/templates
  const builtTemplatesDir = join(currentDir, '..', 'templates');
  const devTemplatesDir = join(currentDir, 'templates');

  if (existsSync(builtTemplatesDir)) {
    return builtTemplatesDir;
  } else if (existsSync(devTemplatesDir)) {
    return devTemplatesDir;
  } else {
    // Fallback - try to find templates directory
    return resolve(currentDir, '..', '..', 'src', 'templates');
  }
}

export type TemplateInput = {
  name: string;
  type: 'string' | 'boolean' | 'number';
  description: string;
  required: boolean;
  default?: string | boolean | number;
}

export type TemplateMetadata = {
  name: string;
  version: string;
  templateSpec: string;
  hatagoVersion: string;
  description: string;
  tags: string[];
  inputs: TemplateInput[];
  hooks?: {
    preInit?: string;
    postInit?: string;
  };
}

export type Template = {
  name: string;
  path: string;
  metadata: TemplateMetadata;
}

export type TemplateVariables = {
  [key: string]: string | boolean | number;
}

/**
 * List all available built-in templates
 */
export function listTemplates(): Template[] {
  const templatesDir = getTemplatesDir();
  const templates: Template[] = [];

  try {
    const entries = readdirSync(templatesDir);

    for (const entry of entries) {
      const fullPath = join(templatesDir, entry);
      const metadataPath = join(fullPath, 'template.json');

      // Skip non-directories and directories without template.json
      if (!statSync(fullPath).isDirectory() || !existsSync(metadataPath)) {
        continue;
      }

      try {
        const metadataContent = readFileSync(metadataPath, 'utf-8');
        const metadata = JSON.parse(metadataContent) as TemplateMetadata;

        templates.push({
          name: entry,
          path: fullPath,
          metadata
        });
      } catch (error) {
        console.warn(`Failed to load template metadata for ${entry}:`, error);
      }
    }
  } catch (error) {
    console.error('Failed to list templates:', error);
  }

  return templates;
}

/**
 * Get a specific template by name
 */
export function getTemplate(name: string): Template | null {
  const templatesDir = getTemplatesDir();
  const templatePath = join(templatesDir, name);
  const metadataPath = join(templatePath, 'template.json');

  if (!existsSync(metadataPath)) {
    return null;
  }

  try {
    const metadataContent = readFileSync(metadataPath, 'utf-8');
    const metadata = JSON.parse(metadataContent) as TemplateMetadata;

    return {
      name,
      path: templatePath,
      metadata
    };
  } catch (error) {
    console.error(`Failed to load template ${name}:`, error);
    return null;
  }
}

/**
 * Process template files with Handlebars
 */
function processTemplateFile(filePath: string, variables: TemplateVariables): string {
  const content = readFileSync(filePath, 'utf-8');
  const template = Handlebars.compile(content);
  return template(variables);
}

/**
 * Check for file conflicts before generating
 */
export function checkFileConflicts(template: Template, targetDir: string): string[] {
  const conflicts: string[] = [];

  function checkDirectory(sourceDir: string, targetDirToCheck: string) {
    try {
      const entries = readdirSync(sourceDir);

      for (const entry of entries) {
        const sourcePath = join(sourceDir, entry);
        const stat = statSync(sourcePath);

        // Skip template.json and hooks directory
        if (entry === 'template.json' || entry === 'hooks') {
          continue;
        }

        if (stat.isDirectory()) {
          const targetSubdir = join(targetDirToCheck, entry);
          checkDirectory(sourcePath, targetSubdir);
        } else {
          // Get target filename (remove .hbs extension if present)
          let targetName = entry;
          if (entry.endsWith('.hbs')) {
            targetName = entry.slice(0, -4);
          }

          const targetPath = join(targetDirToCheck, targetName);

          // Check for conflicts
          if (existsSync(targetPath)) {
            conflicts.push(targetPath);
          }
        }
      }
    } catch {
      // Ignore errors during conflict checking
    }
  }

  checkDirectory(template.path, targetDir);
  return conflicts;
}

/**
 * Copy and process template files to target directory
 */
export function generateFromTemplate(
  template: Template,
  targetDir: string,
  variables: TemplateVariables,
  options: { force?: boolean; skipConflicts?: boolean } = {}
): { created: string[]; skipped: string[]; conflicts: string[] } {
  // Create target directory if it doesn't exist
  if (!existsSync(targetDir)) {
    mkdirSync(targetDir, { recursive: true });
  }

  const result = {
    created: [] as string[],
    skipped: [] as string[],
    conflicts: [] as string[]
  };

  // Check for conflicts first
  if (!options.force) {
    const conflicts = checkFileConflicts(template, targetDir);
    if (conflicts.length > 0 && !options.skipConflicts) {
      result.conflicts = conflicts;
      return result;
    }
  }

  // Process all files in template directory
  processDirectory(template.path, targetDir, variables, options, result);
  return result;
}

/**
 * Recursively process template directory
 */
function processDirectory(
  sourceDir: string,
  targetDir: string,
  variables: TemplateVariables,
  options: { force?: boolean; skipConflicts?: boolean } = {},
  result: { created: string[]; skipped: string[]; conflicts: string[] }
): void {
  const entries = readdirSync(sourceDir);

  for (const entry of entries) {
    const sourcePath = join(sourceDir, entry);
    const stat = statSync(sourcePath);

    // Skip template.json and hooks directory
    if (entry === 'template.json' || entry === 'hooks') {
      continue;
    }

    if (stat.isDirectory()) {
      // Recursively process subdirectories
      const targetSubdir = join(targetDir, entry);
      mkdirSync(targetSubdir, { recursive: true });
      processDirectory(sourcePath, targetSubdir, variables, options, result);
    } else {
      // Process files
      let targetName = entry;
      let targetPath = join(targetDir, targetName);

      // Handle .hbs template files
      if (entry.endsWith('.hbs')) {
        targetName = entry.slice(0, -4); // Remove .hbs extension
        targetPath = join(targetDir, targetName);
      }

      // Check for conflicts
      if (existsSync(targetPath) && !options.force) {
        if (options.skipConflicts) {
          result.skipped.push(targetPath);
          continue;
        } else {
          result.conflicts.push(targetPath);
          continue;
        }
      }

      try {
        if (entry.endsWith('.hbs')) {
          // Process with Handlebars
          const processedContent = processTemplateFile(sourcePath, variables);
          writeFileSync(targetPath, processedContent, 'utf-8');
        } else {
          // Copy non-template files as-is
          copyFileSync(sourcePath, targetPath);
        }
        result.created.push(targetPath);
      } catch (error) {
        console.warn(`Failed to process ${sourcePath}:`, error);
      }
    }
  }
}

/**
 * Validate template inputs against provided variables
 */
export function validateInputs(
  template: TemplateMetadata,
  variables: TemplateVariables
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (const input of template.inputs) {
    const value = variables[input.name];

    // Check required fields
    if (input.required && value === undefined) {
      errors.push(`Missing required input: ${input.name}`);
      continue;
    }

    // Type validation
    if (value !== undefined) {
      const actualType = typeof value;
      if (actualType !== input.type) {
        errors.push(`Invalid type for ${input.name}: expected ${input.type}, got ${actualType}`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Apply default values to variables
 */
export function applyDefaults(
  template: TemplateMetadata,
  variables: TemplateVariables
): TemplateVariables {
  const result = { ...variables };

  for (const input of template.inputs) {
    if (result[input.name] === undefined && input.default !== undefined) {
      result[input.name] = input.default;
    }
  }

  return result;
}

/**
 * Format template list for display
 */
export function formatTemplateList(templates: Template[]): string {
  const lines: string[] = ['Available templates:\n'];

  for (const template of templates) {
    lines.push(`  ${template.name.padEnd(15)} - ${template.metadata.description}`);
    if (template.metadata.tags.length > 0) {
      lines.push(`${''.padEnd(19)}Tags: ${template.metadata.tags.join(', ')}`);
    }
  }

  return lines.join('\n');
}

/**
 * Get template from URL (for future remote template support)
 */
export async function getRemoteTemplate(_url: string): Promise<Template | null> {
  // TODO: Implement remote template fetching
  // This will support:
  // - Direct URLs (https://example.com/template.zip)
  // - GitHub shortcuts (gh:owner/repo#tag)
  // - Registry lookups

  console.warn('Remote templates not yet implemented');
  return Promise.resolve(null);
}

/**
 * Execute template hooks
 */
export async function executeHook(
  template: Template,
  hookName: 'preInit' | 'postInit',
  _targetDir: string
): Promise<void> {
  const hooks = template.metadata.hooks;
  if (!hooks?.[hookName]) {
    return;
  }

  const hookPath = join(template.path, hooks[hookName]);
  if (!existsSync(hookPath)) {
    console.warn(`Hook file not found: ${hookPath}`);
    return;
  }

  // TODO: Execute hook script safely
  // This will require security considerations:
  // - Sandboxing
  // - Permission prompts
  // - Timeout controls

  console.log(`Would execute ${hookName} hook: ${hookPath}`);
  await Promise.resolve();
}
