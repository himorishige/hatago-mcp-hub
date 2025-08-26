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
  JSONRPCNotification,
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
import { streamSSE } from 'hono/streaming';
import { ErrorHelpers } from '../utils/errors.js';

export class StreamableHTTPTransport implements Transport {
  #started = false;
  #initializedSessions = new Map<string, boolean>();
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
        body: (data: string) => void;
      };

      createdAt: number;
      notifications?: JSONRPCMessage[];
      resolveResponse?: () => void; // Response resolver
      streamWriter?: any; // Stream writer for NDJSON streaming
      stream?: {
        closed: boolean;
        close: () => void;
        write: (data: string) => Promise<void>;
      }; // SSE stream
    }
  >();
  #requestToStreamMapping = new Map<RequestId, string>();
  #requestResponseMap = new Map<RequestId, JSONRPCMessage>();

  // SSE session management
  #activeStreams = new Map<string, { sessionId: string; createdAt: number }>();

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

    // Clean up expired SSE sessions
    for (const [sessionId, data] of this.#activeStreams.entries()) {
      if (now - data.createdAt > this.#ttlMs) {
        this.#activeStreams.delete(sessionId);
        this.#initializedSessions.delete(sessionId);
      }
    }

    // Clean up expired initialized sessions
    for (const [sessionId] of this.#initializedSessions.entries()) {
      // If session doesn't have active stream, check if it's expired
      if (!this.#activeStreams.has(sessionId)) {
        // Remove orphaned initialized sessions
        this.#initializedSessions.delete(sessionId);
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
    // For SSE compatibility, handle GET requests as SSE stream initialization
    const sessionId =
      ctx.req.header('mcp-session-id') ||
      this.#sessionIdGenerator?.() ||
      crypto.randomUUID();

    // Store session in activeStreams
    this.#activeStreams.set(sessionId, {
      sessionId,
      createdAt: Date.now(),
    });

    // Initialize session if callback provided
    if (this.#onsessioninitialized) {
      this.#onsessioninitialized(sessionId);
    }

    // Set session ID in response header
    ctx.header('mcp-session-id', sessionId);

    console.error(`[DEBUG SSE] SSE session initialized: ${sessionId}`);

    // Return SSE stream response
    return streamSSE(ctx, async (stream) => {
      // Don't send initial connection event as it's not JSON-RPC compliant
      // MCP Inspector will establish connection through proper initialize request

      // Keep connection alive with heartbeat
      const heartbeatInterval = setInterval(async () => {
        try {
          await stream.write(':heartbeat\n\n');
        } catch (_error) {
          clearInterval(heartbeatInterval);
        }
      }, 30000);

      // Clean up on close
      stream.onAbort(() => {
        clearInterval(heartbeatInterval);
        this.#activeStreams.delete(sessionId);
        console.error(`[DEBUG SSE] SSE session closed: ${sessionId}`);
      });
    });
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
        // Get or generate session ID
        const requestSessionId =
          ctx.req.header('mcp-session-id') ||
          this.#sessionIdGenerator?.() ||
          crypto.randomUUID();

        // Check if this specific session is already initialized
        if (this.#initializedSessions.has(requestSessionId)) {
          // Allow re-initialization for the same session (for reconnection scenarios)
          console.log(
            `[DEBUG] Session ${requestSessionId} is being re-initialized`,
          );
          // Update the session timestamp to keep it alive
          this.#initializedSessions.set(requestSessionId, true);
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
        // Use the same session ID we validated above
        this.sessionId = requestSessionId;
        this.#initializedSessions.set(requestSessionId, true);

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
      // Check if any message has a progress token or if it's a long-running operation
      const hasProgressToken = messages.some(
        (msg: any) =>
          isJSONRPCRequest(msg) &&
          msg.params?._meta?.progressToken !== undefined,
      );

      // Check if this is a tools/call request (potentially long-running)
      const isToolCall = messages.some(
        (msg: any) => isJSONRPCRequest(msg) && msg.method === 'tools/call',
      );

      // Use SSE for long-running operations or when progress token is present
      if (
        (hasProgressToken || isToolCall) &&
        ctx.req.header('accept')?.includes('text/event-stream')
      ) {
        // SSE response for long-running operations
        console.log(
          '[DEBUG StreamableHTTP] Using SSE response for long-running operation',
        );

        const streamId = crypto.randomUUID();

        if (this.sessionId !== undefined) {
          ctx.header('mcp-session-id', this.sessionId);
        }

        // Use Hono's streamSSE helper for proper SSE support
        return streamSSE(ctx, async (stream) => {
          const streamData: any = {
            ctx,
            stream,
            notifications: [],
            createdAt: Date.now(),
          };

          this.#streamMapping.set(streamId, streamData);

          // Map request IDs to this stream
          for (const message of messages) {
            if (isJSONRPCRequest(message)) {
              this.#requestToStreamMapping.set(message.id, streamId);
            }
          }

          // Send initial keepalive to prevent early timeout
          await stream.write(':keepalive\n\n');

          // Set up keepalive interval (every 5 seconds)
          const keepaliveInterval = setInterval(async () => {
            try {
              await stream.write(':keepalive\n\n');
            } catch (_e) {
              // Stream closed, stop keepalive
              clearInterval(keepaliveInterval);
            }
          }, 5000);

          // Store interval for cleanup
          streamData.keepaliveInterval = keepaliveInterval;

          // Process messages (this will trigger the actual work)
          console.log(
            '[DEBUG StreamableHTTP] Processing messages with SSE support',
          );
          for (const message of messages) {
            this.onmessage?.(message, { authInfo });
          }

          // Wait for the response to be ready
          // The response will be sent via the send() method
          const responsePromise = new Promise<void>((resolve) => {
            streamData.resolveResponse = resolve;
          });

          // Wait for response with timeout
          const timeoutPromise = new Promise<void>((_, reject) => {
            setTimeout(() => reject(new Error('Request timeout')), 120000); // 2 minutes for SSE
          });

          try {
            await Promise.race([responsePromise, timeoutPromise]);
            console.log(
              '[DEBUG StreamableHTTP] Response sent, closing SSE stream',
            );
            // Clear the keepalive interval after successful response
            clearInterval(keepaliveInterval);

            // Properly close the SSE stream
            await stream.close();
            console.log(
              '[DEBUG StreamableHTTP] SSE stream closed successfully',
            );
          } catch (error) {
            console.error(
              '[DEBUG StreamableHTTP] SSE timeout or error:',
              error,
            );
            clearInterval(keepaliveInterval);
            await stream.write(`data: ${JSON.stringify({
              jsonrpc: '2.0',
              error: {
                code: -32001,
                message: 'Request timed out',
              },
              id: messages.find(isJSONRPCRequest)?.id || null,
            })}

`);
            // Close stream on error too
            await stream.close();
          } finally {
            // Clean up mappings
            for (const message of messages) {
              if (isJSONRPCRequest(message)) {
                this.#requestToStreamMapping.delete(message.id);
              }
            }
            this.#streamMapping.delete(streamId);
          }
        });
      } else {
        // No progress tokens, use regular JSON response
        const streamId = crypto.randomUUID();

        // Always set session ID header if available
        if (this.sessionId !== undefined) {
          ctx.header('mcp-session-id', this.sessionId);
        }

        // Store the response for this request to send messages back through this connection
        // We need to track by request ID to maintain the connection
        const result = await new Promise<JSONRPCMessage | JSONRPCMessage[]>(
          (resolve, reject) => {
            // Set up timeout for the promise
            const timeoutId = setTimeout(() => {
              console.error('[DEBUG StreamableHTTP] Request timeout triggered');
              reject(new Error('Request timeout: No response received'));
            }, 60000); // 60 second timeout for remote servers

            for (const message of messages) {
              if (isJSONRPCRequest(message)) {
                this.#streamMapping.set(streamId, {
                  ctx: {
                    header: ctx.header.bind(ctx),
                    json: (data: unknown) => {
                      console.log(
                        '[DEBUG StreamableHTTP] Resolving promise with data',
                      );
                      clearTimeout(timeoutId);
                      resolve(data as JSONRPCMessage | JSONRPCMessage[]);
                    },
                    body: (data: string) => {
                      console.log(
                        '[DEBUG StreamableHTTP] Resolving promise with body data',
                      );
                      clearTimeout(timeoutId);
                      resolve(data as any);
                    },
                  },
                  createdAt: Date.now(),
                });
                this.#requestToStreamMapping.set(message.id, streamId);
              }
            }

            // handle each message
            console.log(
              '[DEBUG StreamableHTTP] Processing messages:',
              messages.length,
            );
            for (const message of messages) {
              console.log('[DEBUG StreamableHTTP] Handling message:', message);
              this.onmessage?.(message, { authInfo });
            }
          },
        );

        return ctx.json(result);
      }
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

    const sessionId = ctx.req.header('mcp-session-id');

    if (!sessionId) {
      // For flexible session management (e.g., MCP Inspector compatibility),
      // auto-create an ephemeral session instead of failing
      const ephemeralSessionId =
        this.#sessionIdGenerator?.() || crypto.randomUUID();
      this.sessionId = ephemeralSessionId;
      this.#initializedSessions.set(ephemeralSessionId, true);

      // Set the session ID in response header for client tracking
      ctx.header('mcp-session-id', ephemeralSessionId);

      console.error(
        `[DEBUG] Auto-created ephemeral session: ${ephemeralSessionId}`,
      );
      return true;
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

    // Check if this session has been initialized
    if (!this.#initializedSessions.has(sessionId)) {
      // For flexible session management, auto-initialize unknown sessions
      this.sessionId = sessionId;
      this.#initializedSessions.set(sessionId, true);

      console.error(`[DEBUG] Auto-initialized session: ${sessionId}`);
    }

    return true;
  }

  /**
   * Sends a progress notification to a specific request's SSE stream
   * This is used by McpHub to send progress updates during long-running operations
   */
  async sendProgressNotification(
    requestId: RequestId,
    progressToken: string | number,
    progress?: number,
    total?: number,
  ): Promise<void> {
    const streamId = this.#requestToStreamMapping.get(requestId);
    if (!streamId) {
      console.log(
        '[DEBUG StreamableHTTP] No stream found for request ID:',
        requestId,
      );
      return;
    }

    const streamData = this.#streamMapping.get(streamId);
    if (!streamData?.stream) {
      console.log(
        '[DEBUG StreamableHTTP] No SSE stream found for stream ID:',
        streamId,
      );
      return;
    }

    const notification: JSONRPCNotification = {
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: {
        progressToken,
        progress: progress ?? 0, // デフォルトは0
        ...(total !== undefined && total !== null && { total }), // 値がある場合のみ含める
      },
    };

    try {
      await streamData.stream.write(`data: ${JSON.stringify(notification)}

`);
      console.log(
        '[DEBUG StreamableHTTP] Sent progress notification via SSE:',
        progressToken,
      );
    } catch (e) {
      console.error(
        '[DEBUG StreamableHTTP] Failed to send progress notification:',
        e,
      );
    }
  }

  /**
   * Gets the transport instance for a specific request ID
   * This allows McpHub to send notifications directly to the transport
   */
  getTransportForRequest(
    requestId: RequestId,
  ): StreamableHTTPTransport | undefined {
    const streamId = this.#requestToStreamMapping.get(requestId);
    if (streamId && this.#streamMapping.has(streamId)) {
      return this;
    }
    return undefined;
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
    console.log('[DEBUG StreamableHTTP] send() called with message:', message);

    // Check if this is a notification (has method but no id)
    const isNotification = 'method' in message && !('id' in message);

    if (isNotification) {
      console.log(
        '[DEBUG StreamableHTTP] Processing notification:',
        (message as any).method,
      );

      // For SSE streams, send the notification immediately
      if (options?.relatedRequestId) {
        const streamId = this.#requestToStreamMapping.get(
          options.relatedRequestId,
        );
        if (streamId) {
          const streamData = this.#streamMapping.get(streamId);
          if (streamData?.stream) {
            // Send as SSE event
            try {
              await streamData.stream.write(`data: ${JSON.stringify(message)}

`);
              console.log('[DEBUG StreamableHTTP] Sent notification via SSE');
            } catch (e) {
              console.error(
                '[DEBUG StreamableHTTP] Failed to send notification:',
                e,
              );
            }
          } else if (streamData?.notifications) {
            // Queue for later if stream not ready
            streamData.notifications.push(message);
            console.log(
              '[DEBUG StreamableHTTP] Queued notification (SSE not ready)',
            );
          }
        }
      } else {
        // Broadcast to all active SSE streams
        for (const [streamId, streamData] of this.#streamMapping.entries()) {
          if (streamData.stream) {
            try {
              await streamData.stream.write(`data: ${JSON.stringify(message)}

`);
              console.log(
                '[DEBUG StreamableHTTP] Broadcast notification to stream:',
                streamId,
              );
            } catch (e) {
              console.error('[DEBUG StreamableHTTP] Failed to broadcast:', e);
            }
          }
        }
      }
      return;
    }

    let requestId = options?.relatedRequestId;
    if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
      // If the message is a response, use the request ID from the message
      requestId = message.id;
    }

    console.log('[DEBUG StreamableHTTP] Request ID:', requestId);
    // Without SSE support, we can't send messages without a request ID
    if (requestId === undefined) {
      // Notifications without request ID are discarded
      console.log('[DEBUG StreamableHTTP] No request ID, discarding message');
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
      // Check if this is for an SSE stream
      const streamData = streamId
        ? this.#streamMapping.get(streamId)
        : undefined;

      if (streamData?.stream) {
        // Send response via SSE
        try {
          await streamData.stream.write(`data: ${JSON.stringify(message)}

`);
          console.log('[DEBUG StreamableHTTP] Sent response via SSE');

          // Resolve the response promise to trigger stream closure
          if (streamData.resolveResponse) {
            console.log(
              '[DEBUG StreamableHTTP] Resolving response promise to close stream',
            );
            streamData.resolveResponse();
          }
        } catch (e) {
          console.error(
            '[DEBUG StreamableHTTP] Failed to send response via SSE:',
            e,
          );
        }

        // Clean up
        this.#requestToStreamMapping.delete(requestId);
        // Stream cleanup will be handled by the finally block in streamSSE
      } else {
        // Non-SSE response handling (regular JSON)
        this.#requestResponseMap.set(requestId, message);
        const relatedIds = Array.from(this.#requestToStreamMapping.entries())
          .filter(([, sid]) => sid === streamId)
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
          // Always send responses as JSON (MCP Inspector expects this)
          if (this.sessionId !== undefined) {
            response.ctx.header('mcp-session-id', this.sessionId);
          }

          const responses = relatedIds
            .map((id) => this.#requestResponseMap.get(id))
            .filter((r): r is JSONRPCMessage => r !== undefined);

          // Get the stream data to check for notifications
          const notifications = streamData?.notifications || [];

          if (notifications.length > 0) {
            // Send as NDJSON stream for notifications + response
            console.log(
              '[DEBUG StreamableHTTP] Sending NDJSON stream with notifications:',
              notifications.length,
            );

            // Create NDJSON response
            const ndjsonLines: string[] = [];

            // Add all notifications first
            for (const notification of notifications) {
              ndjsonLines.push(JSON.stringify(notification));
            }

            // Add the actual response(s)
            if (responses.length === 1) {
              ndjsonLines.push(JSON.stringify(responses[0]));
            } else {
              for (const resp of responses) {
                ndjsonLines.push(JSON.stringify(resp));
              }
            }

            // For StreamableHTTP, send the final response as JSON
            // The notifications are already queued in the transport
            const finalResponse = responses[responses.length - 1];
            response.ctx.json(finalResponse);
          } else {
            // Send the response as regular JSON
            response.ctx.json(
              responses.length === 1 ? responses[0] : responses,
            );
          }

          // Clean up after sending
          for (const id of relatedIds) {
            this.#requestResponseMap.delete(id);
            this.#requestToStreamMapping.delete(id);
          }
          this.#streamMapping.delete(streamId);
        }
      }
    }
  }
}
