/**
 * Configuration Loader
 * 
 * Loads and validates configuration files.
 * Supports JSON and JSONC (with comments).
 */

import { readFile } from 'node:fs/promises';
import { resolve, isAbsolute } from 'node:path';
import { existsSync } from 'node:fs';
import type { Logger } from './logger.js';

/**
 * Load configuration from file
 */
export async function loadConfig(configPath: string, logger: Logger): Promise<any> {
  // Resolve path relative to CWD
  const absolutePath = isAbsolute(configPath) 
    ? configPath 
    : resolve(process.cwd(), configPath);
  
  // Check if file exists (optional)
  if (!existsSync(absolutePath)) {
    logger.debug(`Config file not found: ${absolutePath}, using defaults`);
    return {
      path: absolutePath,
      exists: false,
      data: {}
    };
  }
  
  try {
    // Read file
    const content = await readFile(absolutePath, 'utf-8');
    
    // Parse JSON/JSONC (strip comments)
    const jsonContent = stripJsonComments(content);
    const data = JSON.parse(jsonContent);
    
    logger.debug(`Loaded config from ${absolutePath}`);
    
    return {
      path: absolutePath,
      exists: true,
      data
    };
  } catch (error) {
    logger.error(`Failed to load config from ${absolutePath}:`, error);
    throw new Error(`Invalid configuration file: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Strip comments from JSONC content
 */
function stripJsonComments(content: string): string {
  // Remove single-line comments
  content = content.replace(/\/\/.*$/gm, '');
  
  // Remove multi-line comments
  content = content.replace(/\/\*[\s\S]*?\*\//g, '');
  
  // Remove trailing commas (not standard JSON)
  content = content.replace(/,(\s*[}\]])/g, '$1');
  
  return content;
}