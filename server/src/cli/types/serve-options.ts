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
  mode?: 'stdio' | 'http' | 'streamable-http' | 'v2';
  http?: boolean;
  streamableHttp?: boolean;
  streamPort?: string;
  v2?: boolean;
  quiet?: boolean;
  verbose?: boolean;
  logLevel?: string;
  logFormat?: 'json' | 'pretty';
}

/**
 * Type guard to check if mode is valid
 */
export const isValidMode = (
  mode: string,
): mode is 'stdio' | 'http' | 'streamable-http' | 'v2' => {
  return (
    mode === 'stdio' ||
    mode === 'http' ||
    mode === 'streamable-http' ||
    mode === 'v2'
  );
};
