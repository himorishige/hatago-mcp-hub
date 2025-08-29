/**
 * @hatago/core - Core types and protocol definitions for Hatago MCP Hub
 *
 * This package provides pure type definitions with no side effects.
 * All implementations should depend on these core types.
 *
 * Dependency direction: core → runtime → transport → cli
 */

// Error system
export * from './errors/index.js';
// Event contracts
export * from './events/index.js';
// Logger interface
export * from './logger.js';
// Configuration schemas
export * from './schemas.js';
// Protocol and types
export * from './types/index.js';
