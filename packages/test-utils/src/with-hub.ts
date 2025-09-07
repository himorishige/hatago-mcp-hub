import { createHub } from '@himorishige/hatago-hub';
import type { IHub } from '@himorishige/hatago-hub';
import type { HatagoConfig } from '@himorishige/hatago-core/schemas';
import type { HubTestOptions } from './types.js';
import { waitFor } from './wait-for.js';

/**
 * Create and manage a Hub instance for testing
 */
export async function withHub<T>(
  configOrOptions: Partial<HatagoConfig> | HubTestOptions,
  callback: (hub: IHub) => Promise<T>
): Promise<T> {
  const isOptions = (v: unknown): v is HubTestOptions =>
    typeof v === 'object' &&
    v !== null &&
    ('config' in (v as Record<string, unknown>) ||
      'timeout' in (v as Record<string, unknown>) ||
      'verbose' in (v as Record<string, unknown>));

  const options: HubTestOptions = isOptions(configOrOptions)
    ? configOrOptions
    : { config: configOrOptions };

  const config: HatagoConfig = {
    version: 1,
    logLevel: 'info',
    mcpServers: {},
    ...options.config
  };

  const hub = createHub({
    preloadedConfig: { data: config }
  }) as unknown as IHub;

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
