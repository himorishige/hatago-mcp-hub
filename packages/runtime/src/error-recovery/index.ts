/**
 * Error recovery module - Simplified per Hatago philosophy [SF][DM]
 * Only essential retry functionality, no complex state management
 */

// Minimal error classification
export { isTransientError } from './error-classifier.js';

// Simple retry mechanisms
export { retryOnce, simpleRetry, withTimeout } from './simple-retry.js';
