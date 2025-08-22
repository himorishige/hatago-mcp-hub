/**
 * @module
 * MCP HTTP Streaming Helper for Hono.
 */
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import type {
  EventStore,
  StreamableHTTPServerTransportOptions,
} from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type {
  JSONRPCMessage,
  RequestId,
} from '@modelcontextprotocol/sdk/types.js';
import {
  isInitializeRequest,
  isJSONRPCError,
  isJSONRPCRequest,
  isJSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { ErrorHelpers } from '../utils/errors.js';

export class StreamableHTTPTransport implements Transport {
  #started = false;
  #initialized = false;
  #onsessioninitialized?: (sessionId: string) => void;
  #sessionIdGenerator?: () => string;
  #eventStore?: EventStore;
  #enableJsonResponse = false;

  #streamMapping = new Map<
    string,
    {
      ctx: {
        header: (name: string, value: string) => void;
        json: (data: unknown) => void;
      };

      createdAt: number;
    }
  >();
  #requestToStreamMapping = new Map<RequestId, string>();
  #requestResponseMap = new Map<RequestId, JSONRPCMessage>();

  // Memory leak prevention settings
  #maxMapSize = 1000; // Maximum entries in each map
  #ttlMs = 30000; // TTL for map entries (30 seconds)
  #cleanupInterval?: NodeJS.Timeout;
  #cleanupIntervalMs = 10000; // Cleanup interval (10 seconds)

  sessionId?: string | undefined;
  onclose?: () => void;
  onerror?: (error: Error) => void;
  onmessage?: (
    message: JSONRPCMessage,
    extra?: { authInfo?: AuthInfo },
  ) => void;

  constructor(options?: StreamableHTTPServerTransportOptions) {
    this.#sessionIdGenerator = options?.sessionIdGenerator;
    // Enable JSON response mode by default since SSE is deprecated
    this.#enableJsonResponse = options?.enableJsonResponse ?? true;
    this.#eventStore = options?.eventStore;
    this.#onsessioninitialized = options?.onsessioninitialized;
  }

  /**
   * Starts the transport. This is required by the Transport interface but is a no-op
   * for the Streamable HTTP transport as connections are managed per-request.
   */
  async start(): Promise<void> {
    if (this.#started) {
      throw ErrorHelpers.transportAlreadyStarted();
    }
    this.#started = true;

    // Start cleanup interval to prevent memory leaks
    this.startCleanupInterval();
  }

  /**
   * Starts the cleanup interval to remove expired entries
   */
  private startCleanupInterval(): void {
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
    }

    this.#cleanupInterval = setInterval(() => {
      this.cleanupExpiredEntries();
    }, this.#cleanupIntervalMs);
  }

  /**
   * Removes expired entries from all maps
   */
  private cleanupExpiredEntries(): void {
    const now = Date.now();
    const expiredStreamIds = new Set<string>();

    // Find expired streams
    for (const [streamId, data] of this.#streamMapping.entries()) {
      if (now - data.createdAt > this.#ttlMs) {
        expiredStreamIds.add(streamId);
        // Close the stream if it's still open
        if (data.stream && !data.stream.closed) {
          try {
            data.stream.close();
          } catch {
            // Ignore errors during cleanup
          }
        }
      }
    }

    // Clean up expired entries
    for (const streamId of expiredStreamIds) {
      this.#streamMapping.delete(streamId);

      // Clean up related request mappings
      for (const [
        requestId,
        mappedStreamId,
      ] of this.#requestToStreamMapping.entries()) {
        if (mappedStreamId === streamId) {
          this.#requestToStreamMapping.delete(requestId);
          this.#requestResponseMap.delete(requestId);
        }
      }
    }

    // Enforce max size limit (LRU-style cleanup)
    this.enforceMaxSize();
  }

  /**
   * Enforces maximum size limits on maps
   */
  private enforceMaxSize(): void {
    // Clean up streamMapping if it exceeds max size
    if (this.#streamMapping.size > this.#maxMapSize) {
      const sortedEntries = Array.from(this.#streamMapping.entries()).sort(
        (a, b) => a[1].createdAt - b[1].createdAt,
      );

      const entriesToRemove = sortedEntries.slice(
        0,
        sortedEntries.length - this.#maxMapSize,
      );
      for (const [streamId, data] of entriesToRemove) {
        if (data.stream && !data.stream.closed) {
          try {
            data.stream.close();
          } catch {
            // Ignore errors
          }
        }
        this.#streamMapping.delete(streamId);
      }
    }
  }

  /**
   * Handles an incoming HTTP request, whether GET or POST
   */
  async handleRequest(
    ctx: Context,
    parsedBody?: unknown,
  ): Promise<Response | undefined> {
    switch (ctx.req.method) {
      case 'GET':
        return this.handleGetRequest(ctx);
      case 'POST':
        return this.handlePostRequest(ctx, parsedBody);
      case 'DELETE':
        return this.handleDeleteRequest(ctx);
      default:
        return this.handleUnsupportedRequest(ctx);
    }
  }

  /**
   * Handles GET requests for SSE stream
   */
  private async handleGetRequest(ctx: Context) {
    // SSE is deprecated and no longer supported
    // Return 405 Method Not Allowed for all GET requests
    return ctx.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message:
            'SSE transport is deprecated and no longer supported. Please use POST with Streamable HTTP transport.',
        },
        id: null,
      },
      {
        status: 405,
        headers: {
          Allow: 'POST, DELETE',
        },
      },
    );
  }

  /**
   * Handles POST requests containing JSON-RPC messages
   */
  private async handlePostRequest(ctx: Context, parsedBody?: unknown) {
    try {
      // Validate the Accept header
      const acceptHeader = ctx.req.header('Accept');
      const acceptedTypes =
        acceptHeader?.split(',').map((t) => t.trim().split(';')[0]) || [];
      // The client MUST include an Accept header, listing application/json as a supported content type.
      if (!acceptedTypes.includes('application/json')) {
        throw new HTTPException(406, {
          res: Response.json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message: 'Not Acceptable: Client must accept application/json',
            },
            id: null,
          }),
        });
      }

      const ct = ctx.req.header('Content-Type');
      if (!ct?.includes('application/json')) {
        throw new HTTPException(415, {
          res: Response.json({
            jsonrpc: '2.0',
            error: {
              code: -32000,
              message:
                'Unsupported Media Type: Content-Type must be application/json',
            },
            id: null,
          }),
        });
      }

      const authInfo: AuthInfo | undefined = ctx.get('auth');

      let rawMessage = parsedBody;
      if (rawMessage === undefined) {
        rawMessage = await ctx.req.json();
      }

      let messages: JSONRPCMessage[];

      // handle batch and single messages
      if (Array.isArray(rawMessage)) {
        // Temporarily bypass schema validation due to Zod version conflict
        messages = rawMessage as JSONRPCMessage[];
      } else {
        // Temporarily bypass schema validation due to Zod version conflict
        messages = [rawMessage as JSONRPCMessage];
      }

      // Check if this is an initialization request
      // https://spec.modelcontextprotocol.io/specification/2025-03-26/basic/lifecycle/
      const isInitializationRequest = messages.some(isInitializeRequest);
      if (isInitializationRequest) {
        // If it's a server with session management and the session ID is already set we should reject the request
        // to avoid re-initialization.
        if (this.#initialized && this.sessionId !== undefined) {
          throw new HTTPException(400, {
            res: Response.json({
              jsonrpc: '2.0',
              error: {
                code: -32600,
                message: 'Invalid Request: Server already initialized',
              },
              id: null,
            }),
          });
        }

        if (messages.length > 1) {
          throw new HTTPException(400, {
            res: Response.json({
              jsonrpc: '2.0',
              error: {
                code: -32600,
                message:
                  'Invalid Request: Only one initialization request is allowed',
              },
              id: null,
            }),
          });
        }
        this.sessionId = this.#sessionIdGenerator?.();
        this.#initialized = true;

        // If we have a session ID and an onsessioninitialized handler, call it immediately
        // This is needed in cases where the server needs to keep track of multiple sessions
        if (this.sessionId && this.#onsessioninitialized) {
          this.#onsessioninitialized(this.sessionId);
        }
      }

      // If an Mcp-Session-Id is returned by the server during initialization,
      // clients using the Streamable HTTP transport MUST include it
      // in the Mcp-Session-Id header on all of their subsequent HTTP requests.
      if (!isInitializationRequest) {
        this.validateSession(ctx);
      }

      // check if it contains requests
      const hasRequests = messages.some(isJSONRPCRequest);

      if (!hasRequests) {
        // handle each message
        for (const message of messages) {
          this.onmessage?.(message, { authInfo });
        }

        // if it only contains notifications or responses, return 202
        return ctx.body(null, 202);
      }

      // All remaining cases have requests
      // The default behavior is to use SSE streaming
      // but in some cases server will return JSON responses
      const streamId = crypto.randomUUID();

      if (!this.#enableJsonResponse && this.sessionId !== undefined) {
        ctx.header('mcp-session-id', this.sessionId);
      }

      // Store the response for this request to send messages back through this connection
      // We need to track by request ID to maintain the connection
      const result = await new Promise<JSONRPCMessage | JSONRPCMessage[]>(
        (resolve) => {
          for (const message of messages) {
            if (isJSONRPCRequest(message)) {
              this.#streamMapping.set(streamId, {
                ctx: {
                  header: ctx.header,
                  json: resolve,
                },
                createdAt: Date.now(),
              });
              this.#requestToStreamMapping.set(message.id, streamId);
            }
          }

          // handle each message
          for (const message of messages) {
            this.onmessage?.(message, { authInfo });
          }
        },
      );

      return ctx.json(result);
    } catch (error) {
      if (error instanceof HTTPException) {
        throw error;
      }

      this.onerror?.(error as Error);

      // return JSON-RPC formatted error
      throw new HTTPException(400, {
        res: Response.json({
          jsonrpc: '2.0',
          error: {
            code: -32700,
            message: 'Parse error',
            data: String(error),
          },
          id: null,
        }),
      });
    }
  }

  /**
   * Handles DELETE requests to terminate sessions
   */
  private async handleDeleteRequest(ctx: Context) {
    this.validateSession(ctx);

    await this.close();

    return ctx.body(null, 200);
  }

  /**
   * Handles unsupported requests (PUT, PATCH, etc.)
   */
  private handleUnsupportedRequest(ctx: Context) {
    return ctx.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32000,
          message: 'Method not allowed.',
        },
        id: null,
      },
      {
        status: 405,
        headers: {
          Allow: 'GET, POST, DELETE',
        },
      },
    );
  }

  /**
   * Validates session ID for non-initialization requests
   * Returns true if the session is valid, false otherwise
   */
  private validateSession(ctx: Context): boolean {
    if (this.#sessionIdGenerator === undefined) {
      // If the sessionIdGenerator ID is not set, the session management is disabled
      // and we don't need to validate the session ID
      return true;
    }
    if (!this.#initialized) {
      // If the server has not been initialized yet, reject all requests
      throw new HTTPException(400, {
        res: Response.json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: Server not initialized',
          },
          id: null,
        }),
      });
    }

    const sessionId = ctx.req.header('mcp-session-id');

    if (!sessionId) {
      // Non-initialization requests without a session ID should return 400 Bad Request
      throw new HTTPException(400, {
        res: Response.json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message: 'Bad Request: Mcp-Session-Id header is required',
          },
          id: null,
        }),
      });
    }

    if (Array.isArray(sessionId)) {
      throw new HTTPException(400, {
        res: Response.json({
          jsonrpc: '2.0',
          error: {
            code: -32000,
            message:
              'Bad Request: Mcp-Session-Id header must be a single value',
          },
          id: null,
        }),
      });
    }

    if (sessionId !== this.sessionId) {
      // Reject requests with invalid session ID with 404 Not Found
      throw new HTTPException(404, {
        res: Response.json({
          jsonrpc: '2.0',
          error: {
            code: -32001,
            message: 'Session not found',
          },
          id: null,
        }),
      });
    }

    return true;
  }

  async close(): Promise<void> {
    // Stop cleanup interval
    if (this.#cleanupInterval) {
      clearInterval(this.#cleanupInterval);
      this.#cleanupInterval = undefined;
    }

    // Close all SSE connections
    for (const { stream } of this.#streamMapping.values()) {
      if (stream && !stream.closed) {
        try {
          stream.close();
        } catch {
          // Ignore errors during cleanup
        }
      }
    }

    this.#streamMapping.clear();
    this.#requestToStreamMapping.clear();
    this.#requestResponseMap.clear();
    this.onclose?.();
  }

  async send(
    message: JSONRPCMessage,
    options?: { relatedRequestId?: RequestId },
  ): Promise<void> {
    let requestId = options?.relatedRequestId;
    if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
      // If the message is a response, use the request ID from the message
      requestId = message.id;
    }

    // Without SSE support, we can't send messages without a request ID
    if (requestId === undefined) {
      // Notifications without request ID are discarded
      return;
    }

    // Get the response for this request
    const streamId = this.#requestToStreamMapping.get(requestId);
    const response = streamId ? this.#streamMapping.get(streamId) : undefined;
    if (!streamId) {
      throw ErrorHelpers.operationFailed(
        'Connection lookup',
        `No connection established for request ID: ${String(requestId)}`,
      );
    }

    if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
      this.#requestResponseMap.set(requestId, message);
      const relatedIds = Array.from(this.#requestToStreamMapping.entries())
        .filter(
          ([, streamId]) => this.#streamMapping.get(streamId) === response,
        )
        .map(([id]) => id);

      // Check if we have responses for all requests using this connection
      const allResponsesReady = relatedIds.every((id) =>
        this.#requestResponseMap.has(id),
      );

      if (allResponsesReady) {
        if (!response) {
          throw ErrorHelpers.operationFailed(
            'Connection lookup',
            `No connection established for request ID: ${String(requestId)}`,
          );
        }
        if (this.#enableJsonResponse) {
          // All responses ready, send as JSON
          if (this.sessionId !== undefined) {
            response.ctx.header('mcp-session-id', this.sessionId);
          }

          const responses = relatedIds
            .map((id) => this.#requestResponseMap.get(id))
            .filter((r): r is JSONRPCMessage => r !== undefined);

          response.ctx.json(responses.length === 1 ? responses[0] : responses);
          return;
        }
        // Streaming response is not supported in the current implementation
        // All responses are sent as JSON when enableJsonResponse is true
        // Clean up
        for (const id of relatedIds) {
          this.#requestResponseMap.delete(id);
          this.#requestToStreamMapping.delete(id);
        }
      }
    }
  }
}
