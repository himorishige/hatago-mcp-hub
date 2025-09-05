/**
 * Hatago UI Package Entry Point
 *
 * This package provides a web interface for Hatago MCP Hub.
 * It's designed to be optionally loaded and integrated with the existing HTTP server.
 */

import { Hono } from 'hono';
// import { serveStatic } from 'hono/serve-static'
import { createUIApi } from './api.js';
import { createExtendedApi } from './api-extended.js';
import type { HatagoHub } from '@himorishige/hatago-hub';

export interface UIOptions {
  hub: HatagoHub;
  configPath?: string;
  configManager?: any; // ConfigManager instance from server
}

/**
 * Create the complete UI app with API and static file serving
 */
export async function createHatagoUI(options: UIOptions) {
  const { hub, configPath, configManager } = options;
  const app = new Hono();

  // Create sub-apps for different functionalities
  const apiApp = createUIApi({ hub });
  const extendedApiApp = createExtendedApi({
    hub,
    configPath: configPath || './config.json',
    configManager
  });

  // Mount API routes
  app.route('/api', apiApp);
  app.route('/api', extendedApiApp);

  // Mount daisyUI UI
  const { createDaisyUI } = await import('./ui-daisy.js');
  const daisyApp = createDaisyUI({
    hub,
    configPath: configPath || './config.json'
  });
  app.route('/', daisyApp);

  return app;
}

// Export types for external use
export type { StatusResponse, ReloadResponse, ServersResponse, UIApiOptions } from './api.js';
