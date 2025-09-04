/**
 * Event type definitions for Hatago Hub
 * Pure types with no side effects
 */

/**
 * Server lifecycle events
 */
export type ServerEvents = {
  'server:started': { serverId: string; timestamp: Date };
  'server:stopped': { serverId: string; timestamp: Date };
  'server:error': { serverId: string; error: Error; timestamp: Date };
  'server:reconnecting': { serverId: string; attempt: number; timestamp: Date };
  'server:reconnected': { serverId: string; timestamp: Date };
};

/**
 * Tool discovery events
 */
export type ToolEvents = {
  'tools:discovered': { serverId: string; count: number; timestamp: Date };
  'tools:registered': { serverId: string; tools: string[]; timestamp: Date };
  'tools:removed': { serverId: string; tools: string[]; timestamp: Date };
};

/**
 * Resource discovery events
 */
export type ResourceEvents = {
  'resources:discovered': { serverId: string; count: number; timestamp: Date };
  'resources:registered': { serverId: string; uris: string[]; timestamp: Date };
  'resources:removed': { serverId: string; uris: string[]; timestamp: Date };
};

/**
 * Prompt discovery events
 */
export type PromptEvents = {
  'prompts:discovered': { serverId: string; count: number; timestamp: Date };
  'prompts:registered': { serverId: string; names: string[]; timestamp: Date };
  'prompts:removed': { serverId: string; names: string[]; timestamp: Date };
};

/**
 * Session lifecycle events
 */
export type SessionEvents = {
  'session:created': { sessionId: string; timestamp: Date };
  'session:expired': { sessionId: string; timestamp: Date };
  'session:deleted': { sessionId: string; timestamp: Date };
};

/**
 * All event types
 */
export type HatagoEvents = ServerEvents &
  ToolEvents &
  ResourceEvents &
  PromptEvents &
  SessionEvents;

/**
 * Event names
 */
export type EventName = keyof HatagoEvents;

/**
 * Event payload for a specific event
 */
export type EventPayload<T extends EventName> = HatagoEvents[T];
