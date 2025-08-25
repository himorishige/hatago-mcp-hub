/**
 * Hatago Protocol Types
 *
 * Core protocol definitions for Hatago MCP Hub.
 * Extends JSON-RPC with streaming capabilities.
 */

// Base JSON-RPC compatible types
export interface JsonRpcRequest {
  jsonrpc: '2.0';
  id: string | number | null;
  method: string;
  params?: any;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number | null;
  result?: any;
  error?: JsonRpcError;
}

export interface JsonRpcError {
  code: number;
  message: string;
  data?: any;
}

// Error classification for better handling
export enum ErrorType {
  UserError = 'UserError', // Validation errors (400-level)
  SystemError = 'SystemError', // Retryable system errors (500-level)
  PolicyError = 'PolicyError', // Authorization/permission errors (403-level)
}

export interface HatagoError extends JsonRpcError {
  type: ErrorType;
  retryable?: boolean;
  serverName?: string;
  originalError?: any;
}

// Stream frame types for WebSocket transport
export interface StreamFrame {
  type: 'data' | 'error' | 'end' | 'heartbeat' | 'cancel';
  id: string;
  seq: number;
  timestamp: number;
  payload?: any;
}

// Core protocol interface
export interface HatagoProtocol {
  // Standard JSON-RPC call
  call(method: string, params?: any): Promise<any>;

  // Streaming operations
  stream: {
    open(id: string, method: string, params?: any): void;
    push(id: string, data: any): void;
    end(id: string): void;
    cancel(id: string): void;
  };

  // Connection management
  close(): void;
}

// Capabilities negotiation
export interface Capabilities {
  tools?: ToolCapability[];
  resources?: ResourceCapability[];
  prompts?: PromptCapability[];
  streaming?: boolean;
  maxConcurrency?: number;
  version?: string;
}

export interface ToolCapability {
  name: string;
  description?: string;
  inputSchema?: any;
  outputSchema?: any;
  streaming?: boolean;
}

export interface ResourceCapability {
  uri: string;
  name?: string;
  description?: string;
  mimeType?: string;
}

export interface PromptCapability {
  name: string;
  description?: string;
  arguments?: any[];
}

// Server identification and metadata
export interface ServerInfo {
  name: string;
  version?: string;
  capabilities: Capabilities;
  metadata?: Record<string, any>;
}

// Transport abstraction
export interface Transport {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: any): Promise<void>;
  onMessage(handler: (message: any) => void): void;
  onError(handler: (error: Error) => void): void;
  onClose(handler: () => void): void;
  isConnected(): boolean;
}
