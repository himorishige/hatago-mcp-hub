import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FixtureOptions, TestFixture } from './types.js';
import { getRandomPort } from './port-utils.js';
import { waitFor } from './wait-for.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

/**
 * Create and manage a test fixture server
 */
export async function withFixture<T>(
  options: FixtureOptions,
  callback: (fixture: TestFixture) => Promise<T>
): Promise<T> {
  const fixture = await createFixture(options);

  try {
    return await callback(fixture);
  } finally {
    await fixture.cleanup();
  }
}

async function createFixture(options: FixtureOptions): Promise<TestFixture> {
  const { type, features = {} } = options;
  const port = options.port ?? (await getRandomPort());

  if (type === 'stdio') {
    return createStdioFixture(features);
  } else if (type === 'http' || type === 'sse') {
    return createHttpFixture(port, type, features);
  }

  throw new Error(`Unsupported fixture type: ${type}`);
}

function createStdioFixture(features: FixtureOptions['features'] = {}): TestFixture {
  const fixturePath = join(__dirname, '../../test-fixtures/dist/stdio-server.js');
  const args = [];

  // Add feature flags
  if (features.echo !== false) args.push('--echo');
  if (features.stream) args.push('--stream');
  if (features.slow) args.push('--slow');
  if (features.fail) args.push('--fail');
  if (features.resources) args.push('--resources');

  return {
    type: 'stdio',
    command: 'node',
    args: [fixturePath, ...args],
    cleanup: async () => {
      // No child process for stdio fixtures (handled by hub)
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
}

async function createHttpFixture(
  port: number,
  type: 'http' | 'sse',
  features: FixtureOptions['features'] = {}
): Promise<TestFixture> {
  const fixturePath = join(__dirname, '../../test-fixtures/dist/http-server.js');
  const args = ['--port', String(port)];

  // Add feature flags
  if (features.echo !== false) args.push('--echo');
  if (features.stream) args.push('--stream');
  if (features.slow) args.push('--slow');
  if (features.fail) args.push('--fail');
  if (features.resources) args.push('--resources');

  if (type === 'sse') {
    args.push('--sse');
  }

  const childProcess = spawn('node', [fixturePath, ...args], {
    stdio: 'pipe',
    env: { ...process.env, NODE_ENV: 'test' }
  });

  // Wait for server to be ready
  await waitFor(
    async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/health`);
        return response.ok;
      } catch {
        return false;
      }
    },
    {
      timeout: 5000,
      errorMessage: `HTTP fixture failed to start on port ${port}`
    }
  );

  return {
    type,
    port,
    url: `http://127.0.0.1:${port}`,
    cleanup: async () => {
      if (childProcess && typeof childProcess.kill === 'function') {
        childProcess.kill();
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  };
}
