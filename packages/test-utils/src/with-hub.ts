import { createHub } from '@himorishige/hatago-hub';
import type { HatagoHub } from '@himorishige/hatago-hub';
import type { HatagoConfig } from '@himorishige/hatago-core/schemas';
import type { HubTestOptions } from './types.js';
import { waitFor } from './wait-for.js';

/**
 * Create and manage a Hub instance for testing
 */
export async function withHub<T>(
  configOrOptions: Partial<HatagoConfig> | HubTestOptions,
  callback: (hub: HatagoHub) => Promise<T>
): Promise<T> {
  const options: HubTestOptions =
    'config' in configOrOptions ? configOrOptions : { config: configOrOptions };

  const config: HatagoConfig = {
    version: 1,
    mcpServers: {},
    ...options.config
  };

  const hub = createHub({
    config,
    logLevel: options.verbose ? 'debug' : 'error'
  });

  try {
    // Start the hub
    await hub.start();

    // Wait a short time for hub to be ready
    await waitFor(() => true, {
      timeout: 100,
      errorMessage: 'Hub failed to become ready'
    });

    // Run the test callback
    return await callback(hub);
  } finally {
    // Always cleanup
    try {
      await hub.stop();
    } catch (error) {
      console.error('Failed to stop hub:', error);
    }
  }
}
