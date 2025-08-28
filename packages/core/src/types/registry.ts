/**
 * Registry type definitions for Hatago MCP Hub
 * Pure types with no side effects
 */

import type { Tool, Resource, Prompt } from '@modelcontextprotocol/sdk/types.js';

/**
 * Tool metadata for registry
 */
export interface ToolMetadata {
  serverId: string;
  originalName: string;
  publicName: string;
  tool: Tool;
}

/**
 * Resource metadata for registry
 */
export interface ResourceMetadata {
  serverId: string;
  originalUri: string;
  publicUri: string;
  resource: Resource;
}

/**
 * Prompt metadata for registry
 */
export interface PromptMetadata {
  serverId: string;
  originalName: string;
  publicName: string;
  prompt: Prompt;
}