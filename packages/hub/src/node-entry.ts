/**
 * Node.js entry point for @hatago/hub
 *
 * Initializes the platform with Node.js-specific implementations
 * before exporting the main hub functionality.
 */

import { setPlatform } from "@hatago/runtime";
import { createNodePlatform } from "@hatago/runtime/platform/node";

// Initialize Node.js platform
setPlatform(createNodePlatform());

// Export hub functionality
export * from "./errors.js";
export { HatagoHub } from "./hub.js";
export { createHub } from "./index.js";
export * from "./types.js";

// Export hub-streamable for HTTP handling
export {
  createEventsEndpoint,
  handleMCPEndpoint,
  handleSSEEndpoint,
} from "./hub-streamable.js";
