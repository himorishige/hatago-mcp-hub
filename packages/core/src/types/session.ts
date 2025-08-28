/**
 * Session type definitions for Hatago MCP Hub
 * Pure types with no side effects
 */

/**
 * Session data
 */
export interface Session {
  id: string;
  createdAt: Date;
  lastAccessedAt: Date;
  ttlSeconds: number;
}