/**
 * Message Parser for MCP Transport
 * Pure functions for parsing different message framing formats
 */

import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Parse result from message parsing
 */
export interface ParseResult {
  messages: JSONRPCMessage[];
  remainingBuffer: Buffer;
}

/**
 * Parse newline-delimited JSON messages from a buffer
 */
export function parseNewlineDelimited(buffer: Buffer): ParseResult {
  const messages: JSONRPCMessage[] = [];
  let currentBuffer = buffer;

  while (true) {
    const newlineIndex = currentBuffer.indexOf('\n');
    if (newlineIndex === -1) {
      // No complete message, return what we have
      break;
    }

    const line = currentBuffer.subarray(0, newlineIndex);
    currentBuffer = currentBuffer.subarray(newlineIndex + 1);

    // Skip empty lines
    if (line.length === 0) {
      continue;
    }

    try {
      const message = JSON.parse(line.toString('utf-8')) as JSONRPCMessage;
      messages.push(message);
    } catch (error) {
      // Invalid JSON, skip this line
      console.error('Failed to parse JSON message:', error);
    }
  }

  return {
    messages,
    remainingBuffer: currentBuffer,
  };
}

/**
 * Parse Content-Length formatted messages from a buffer
 */
export function parseContentLength(buffer: Buffer): ParseResult {
  const messages: JSONRPCMessage[] = [];
  let currentBuffer = buffer;

  while (true) {
    // Look for Content-Length header
    const headerEnd = findHeaderEnd(currentBuffer);
    if (headerEnd === -1) {
      // No complete header yet
      break;
    }

    // Parse Content-Length value
    const headerSection = currentBuffer
      .subarray(0, headerEnd)
      .toString('utf-8');
    const contentLength = extractContentLength(headerSection);

    if (contentLength === -1) {
      // Invalid header, skip it
      currentBuffer = currentBuffer.subarray(headerEnd + 4); // Skip past \r\n\r\n
      continue;
    }

    // Check if we have the complete message body
    const bodyStart = headerEnd + 4; // After \r\n\r\n
    const bodyEnd = bodyStart + contentLength;

    if (currentBuffer.length < bodyEnd) {
      // Don't have complete message yet
      break;
    }

    // Extract and parse the message body
    const body = currentBuffer.subarray(bodyStart, bodyEnd);
    currentBuffer = currentBuffer.subarray(bodyEnd);

    try {
      const message = JSON.parse(body.toString('utf-8')) as JSONRPCMessage;
      messages.push(message);
    } catch (error) {
      console.error('Failed to parse JSON message:', error);
    }
  }

  return {
    messages,
    remainingBuffer: currentBuffer,
  };
}

/**
 * Find the end of headers (looking for \r\n\r\n)
 */
function findHeaderEnd(buffer: Buffer): number {
  const delimiter = Buffer.from('\r\n\r\n');
  const index = buffer.indexOf(delimiter);
  return index === -1 ? -1 : index;
}

/**
 * Extract Content-Length value from headers
 */
function extractContentLength(headers: string): number {
  const match = headers.match(/Content-Length:\s*(\d+)/i);
  if (!match) {
    return -1;
  }
  return parseInt(match[1], 10);
}

/**
 * Format a message for newline-delimited transport
 */
export function formatNewlineDelimited(message: JSONRPCMessage): Buffer {
  const json = JSON.stringify(message);
  return Buffer.from(`${json}\n`, 'utf-8');
}

/**
 * Format a message for Content-Length transport
 */
export function formatContentLength(message: JSONRPCMessage): Buffer {
  const json = JSON.stringify(message);
  const contentLength = Buffer.byteLength(json, 'utf-8');
  const header = `Content-Length: ${contentLength}\r\n\r\n`;
  return Buffer.concat([
    Buffer.from(header, 'utf-8'),
    Buffer.from(json, 'utf-8'),
  ]);
}

/**
 * Auto-detect message format from buffer
 */
export function detectFormat(
  buffer: Buffer,
): 'newline' | 'content-length' | 'unknown' {
  // Check for Content-Length header
  const str = buffer
    .subarray(0, Math.min(100, buffer.length))
    .toString('utf-8');
  if (str.includes('Content-Length:')) {
    return 'content-length';
  }

  // Check for newline-delimited JSON
  const newlineIndex = buffer.indexOf('\n');
  if (newlineIndex > 0 && newlineIndex < 1000) {
    // Try to parse as JSON
    const line = buffer.subarray(0, newlineIndex).toString('utf-8');
    try {
      JSON.parse(line);
      return 'newline';
    } catch {
      // Not valid JSON
    }
  }

  return 'unknown';
}

/**
 * Parse messages with auto-detection
 */
export function parseAutoDetect(
  buffer: Buffer,
  preferredFormat?: 'newline' | 'content-length',
): ParseResult & { format: 'newline' | 'content-length' | 'unknown' } {
  // Use preferred format if specified
  if (preferredFormat === 'newline') {
    return { ...parseNewlineDelimited(buffer), format: 'newline' };
  }
  if (preferredFormat === 'content-length') {
    return { ...parseContentLength(buffer), format: 'content-length' };
  }

  // Auto-detect format
  const format = detectFormat(buffer);

  switch (format) {
    case 'newline':
      return { ...parseNewlineDelimited(buffer), format };
    case 'content-length':
      return { ...parseContentLength(buffer), format };
    default: {
      // Try newline first as it's simpler
      const result = parseNewlineDelimited(buffer);
      if (result.messages.length > 0) {
        return { ...result, format: 'newline' };
      }
      // Fall back to content-length
      return { ...parseContentLength(buffer), format: 'content-length' };
    }
  }
}
