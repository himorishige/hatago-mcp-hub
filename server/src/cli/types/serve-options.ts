/**
 * Type definitions for serve command options
 */

/**
 * Options for the serve command from Commander.js
 */
export interface ServeOptions {
  config?: string;
  profile?: string;
  port?: string;
  mode?: 'stdio' | 'http';
  http?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  logLevel?: string;
  logFormat?: 'json' | 'pretty';
}

/**
 * Type guard to check if mode is valid
 */
export const isValidMode = (mode: string): mode is 'stdio' | 'http' => {
  return mode === 'stdio' || mode === 'http';
};
