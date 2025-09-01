import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tempDirs = new Set<string>();

/**
 * Create a temporary directory
 */
export async function createTempDir(prefix = 'hatago-test-'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

/**
 * Clean up a temporary directory
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  if (tempDirs.has(dir)) {
    await rm(dir, { recursive: true, force: true });
    tempDirs.delete(dir);
  }
}

/**
 * Clean up all temporary directories
 */
export async function cleanupAllTempDirs(): Promise<void> {
  await Promise.all(Array.from(tempDirs).map((dir) => cleanupTempDir(dir)));
}

// Clean up on process exit
process.on('exit', () => {
  // Synchronous cleanup not supported, rely on OS cleanup
  tempDirs.clear();
});
