/**
 * Tool Invoker types
 */

import type { Tool } from '@himorishige/hatago-core';

/**
 * Progress callback for long-running operations
 */
export type ProgressCallback = (progress: number, total?: number, message?: string) => void;

/**
 * Tool handler function
 */
export type ToolHandler = (args: unknown, progressCallback?: ProgressCallback) => Promise<unknown>;

/**
 * Tool call result
 */
export interface ToolCallResult {
  content?: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

/**
 * Tool with handler
 */
export interface ToolWithHandler extends Tool {
  handler: ToolHandler;
}

/**
 * Tool Invoker options
 */
export interface ToolInvokerOptions {
  timeout?: number;
  retryCount?: number;
  retryDelay?: number;
  progressToken?: string;
}
