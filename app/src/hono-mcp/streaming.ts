import type { Context } from 'hono';
import { SSEStreamingApi } from 'hono/streaming';

/**
 * Checks if running on an old Bun version that requires special handling
 * Uses feature detection and semver comparison for robustness
 */
let isOldBunVersion = (): boolean => {
  // Feature detection: Check if Bun exists
  // @ts-expect-error @types/bun is not installed
  if (typeof globalThis.Bun === 'undefined') {
    return false;
  }

  // @ts-expect-error @types/bun is not installed
  const version: string = globalThis.Bun.version;
  if (!version || typeof version !== 'string') {
    // If version is not available, assume newer version (safer default)
    return false;
  }

  // Parse version parts for comparison
  const versionParts = version.split('.').map((v) => parseInt(v, 10));
  if (versionParts.length < 2 || versionParts.some(Number.isNaN)) {
    // Invalid version format, assume newer version
    console.warn(`Invalid Bun version format: ${version}`);
    return false;
  }

  const [major, minor, patch = 0] = versionParts;

  // Old versions: < 1.1.27
  // Bun v1.1.27 fixed the ReadableStream cancel() issue
  const result =
    major === 0 ||
    (major === 1 && minor === 0) ||
    (major === 1 && minor === 1 && patch < 27);

  // Cache the result to avoid repeated checks
  isOldBunVersion = () => result;
  return result;
};

const run = async (
  stream: SSEStreamingApi,
  cb: (stream: SSEStreamingApi) => Promise<void>,
  onError?: (e: Error, stream: SSEStreamingApi) => Promise<void>,
): Promise<void> => {
  try {
    await cb(stream);
  } catch (e) {
    if (e instanceof Error && onError) {
      await onError(e, stream);

      await stream.writeSSE({
        event: 'error',
        data: e.message,
      });
    } else {
      console.error(e);
    }
  }
};

const contextStash: WeakMap<ReadableStream, Context> = new WeakMap<
  ReadableStream,
  Context
>();

export const streamSSE = (
  c: Context,
  cb: (stream: SSEStreamingApi) => Promise<void>,
  onError?: (e: Error, stream: SSEStreamingApi) => Promise<void>,
): Response => {
  const { readable, writable } = new TransformStream();
  const stream = new SSEStreamingApi(writable, readable);

  // Until Bun v1.1.27, Bun didn't call cancel() on the ReadableStream for Response objects from Bun.serve()
  if (isOldBunVersion()) {
    c.req.raw.signal.addEventListener('abort', () => {
      if (!stream.closed) {
        stream.abort();
      }
    });
  }

  // in bun, `c` is destroyed when the request is returned, so hold it until the end of streaming
  contextStash.set(stream.responseReadable, c);

  c.header('Transfer-Encoding', 'chunked');
  c.header('Content-Type', 'text/event-stream');
  c.header('Cache-Control', 'no-cache');
  c.header('Connection', 'keep-alive');

  run(stream, cb, onError);

  return c.newResponse(stream.responseReadable);
};
