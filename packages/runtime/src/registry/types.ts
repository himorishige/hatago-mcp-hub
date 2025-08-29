/**
 * Registry type definitions
 */

/**
 * Tool naming strategies
 */
export type ToolNamingStrategy =
  | 'prefix'
  | 'suffix'
  | 'none'
  | 'namespace'
  | 'error'
  | 'alias';

/**
 * Tool naming configuration
 */
export interface ToolNamingConfig {
  strategy: ToolNamingStrategy;
  separator?: string;
  serverIdInName?: boolean;
  format?: string;
  aliases?: Record<string, string>;
}

/**
 * Default tool naming configuration
 */
export const DEFAULT_TOOL_NAMING_CONFIG: ToolNamingConfig = {
  strategy: 'prefix',
  separator: '__',
  serverIdInName: true,
};

/**
 * Resource naming configuration (same as tool for now)
 */
export type ResourceNamingConfig = ToolNamingConfig;

/**
 * Prompt naming configuration (same as tool for now)
 */
export type PromptNamingConfig = ToolNamingConfig;

/**
 * Combined naming configuration
 */
export interface NamingConfig {
  toolNaming?: ToolNamingConfig;
  resourceNaming?: ResourceNamingConfig;
  promptNaming?: PromptNamingConfig;
}
