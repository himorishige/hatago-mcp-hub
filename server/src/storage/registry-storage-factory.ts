/**
 * Factory for creating registry storage instances
 */

import type { HatagoConfig } from '../types/config.js';
import { FileRegistryStorage } from './file-registry-storage.js';
import { createMemoryRegistryStorage } from './memory-registry-storage.js';
import type { RegistryStorage } from './registry-storage.js';

export function createRegistryStorage(
  config: HatagoConfig,
  workDir: string,
): RegistryStorage {
  const persistConfig = config.registry?.persist;

  if (!persistConfig || !persistConfig.enabled) {
    return createMemoryRegistryStorage();
  }

  switch (persistConfig.type) {
    case 'file':
      return new FileRegistryStorage(workDir);
    default:
      return createMemoryRegistryStorage();
  }
}
