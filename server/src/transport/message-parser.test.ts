import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  detectFormat,
  extractContentLength,
  findHeaderEnd,
  formatContentLength,
  formatNewlineDelimited,
  parseAutoDetect,
  parseContentLength,
  parseNewlineDelimited,
} from './message-parser.js';

describe('message-parser', () => {
  beforeAll(() => {
    // Suppress console.error during tests
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  const createMessage = (id: number): JSONRPCMessage => ({
    jsonrpc: '2.0',
    method: 'test',
    params: { value: id },
    id,
  });

  describe('parseNewlineDelimited', () => {
    it('should parse single newline-delimited message', () => {
      const message = createMessage(1);
      const buffer = Buffer.from(`${JSON.stringify(message)}\n`);

      const result = parseNewlineDelimited(buffer);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(message);
      expect(result.remainingBuffer.length).toBe(0);
    });

    it('should parse multiple newline-delimited messages', () => {
      const message1 = createMessage(1);
      const message2 = createMessage(2);
      const buffer = Buffer.from(
        `${JSON.stringify(message1)}\n${JSON.stringify(message2)}\n`,
      );

      const result = parseNewlineDelimited(buffer);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(message1);
      expect(result.messages[1]).toEqual(message2);
      expect(result.remainingBuffer.length).toBe(0);
    });

    it('should handle incomplete message', () => {
      const message = createMessage(1);
      const completeBuffer = Buffer.from(`${JSON.stringify(message)}\n`);
      const incompleteJson = '{"incomplete":';
      const buffer = Buffer.concat([
        completeBuffer,
        Buffer.from(incompleteJson),
      ]);

      const result = parseNewlineDelimited(buffer);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(message);
      expect(result.remainingBuffer.toString()).toBe(incompleteJson);
    });

    it('should skip empty lines', () => {
      const message = createMessage(1);
      const buffer = Buffer.from(`\n\n${JSON.stringify(message)}\n\n`);

      const result = parseNewlineDelimited(buffer);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(message);
    });

    it('should handle invalid JSON gracefully', () => {
      const validMessage = createMessage(1);
      const buffer = Buffer.from(
        `invalid json\n${JSON.stringify(validMessage)}\n`,
      );

      const result = parseNewlineDelimited(buffer);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(validMessage);
    });

    it('should return empty array for buffer without newlines', () => {
      const buffer = Buffer.from('{"incomplete": "message"');

      const result = parseNewlineDelimited(buffer);

      expect(result.messages).toHaveLength(0);
      expect(result.remainingBuffer.toString()).toBe(
        '{"incomplete": "message"',
      );
    });
  });

  describe('parseContentLength', () => {
    it('should parse single Content-Length message', () => {
      const message = createMessage(1);
      const json = JSON.stringify(message);
      const buffer = Buffer.from(
        `Content-Length: ${json.length}\r\n\r\n${json}`,
      );

      const result = parseContentLength(buffer);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(message);
      expect(result.remainingBuffer.length).toBe(0);
    });

    it('should parse multiple Content-Length messages', () => {
      const message1 = createMessage(1);
      const message2 = createMessage(2);
      const json1 = JSON.stringify(message1);
      const json2 = JSON.stringify(message2);
      const buffer = Buffer.from(
        `Content-Length: ${json1.length}\r\n\r\n${json1}` +
          `Content-Length: ${json2.length}\r\n\r\n${json2}`,
      );

      const result = parseContentLength(buffer);

      expect(result.messages).toHaveLength(2);
      expect(result.messages[0]).toEqual(message1);
      expect(result.messages[1]).toEqual(message2);
      expect(result.remainingBuffer.length).toBe(0);
    });

    it('should handle incomplete header', () => {
      const buffer = Buffer.from('Content-Length: 42\r\n');

      const result = parseContentLength(buffer);

      expect(result.messages).toHaveLength(0);
      expect(result.remainingBuffer).toEqual(buffer);
    });

    it('should handle incomplete body', () => {
      const message = createMessage(1);
      const json = JSON.stringify(message);
      const buffer = Buffer.from(
        `Content-Length: ${json.length + 10}\r\n\r\n${json}`,
      );

      const result = parseContentLength(buffer);

      expect(result.messages).toHaveLength(0);
      expect(result.remainingBuffer).toEqual(buffer);
    });

    it('should handle invalid Content-Length value', () => {
      const buffer = Buffer.from(
        'Content-Length: invalid\r\n\r\n{"test": true}',
      );

      const result = parseContentLength(buffer);

      expect(result.messages).toHaveLength(0);
    });

    it('should handle case-insensitive Content-Length header', () => {
      const message = createMessage(1);
      const json = JSON.stringify(message);
      const buffer = Buffer.from(
        `content-length: ${json.length}\r\n\r\n${json}`,
      );

      const result = parseContentLength(buffer);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0]).toEqual(message);
    });
  });

  describe('formatNewlineDelimited', () => {
    it('should format message with newline', () => {
      const message = createMessage(1);
      const buffer = formatNewlineDelimited(message);

      const expected = `${JSON.stringify(message)}\n`;
      expect(buffer.toString()).toBe(expected);
    });
  });

  describe('formatContentLength', () => {
    it('should format message with Content-Length header', () => {
      const message = createMessage(1);
      const buffer = formatContentLength(message);

      const json = JSON.stringify(message);
      const expected = `Content-Length: ${json.length}\r\n\r\n${json}`;
      expect(buffer.toString()).toBe(expected);
    });

    it('should handle UTF-8 characters correctly', () => {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        method: 'test',
        params: { text: '日本語' },
        id: 1,
      };
      const buffer = formatContentLength(message);

      const json = JSON.stringify(message);
      const byteLength = Buffer.byteLength(json, 'utf-8');
      const header = buffer.toString().split('\r\n\r\n')[0];
      expect(header).toBe(`Content-Length: ${byteLength}`);
    });
  });

  describe('detectFormat', () => {
    it('should detect Content-Length format', () => {
      const buffer = Buffer.from('Content-Length: 42\r\n\r\n');
      expect(detectFormat(buffer)).toBe('content-length');
    });

    it('should detect newline-delimited format', () => {
      const message = createMessage(1);
      const buffer = Buffer.from(`${JSON.stringify(message)}\n`);
      expect(detectFormat(buffer)).toBe('newline');
    });

    it('should return unknown for invalid format', () => {
      const buffer = Buffer.from('random data without proper format');
      expect(detectFormat(buffer)).toBe('unknown');
    });

    it('should detect case-insensitive Content-Length', () => {
      const buffer = Buffer.from('content-length: 42\r\n\r\n');
      expect(detectFormat(buffer)).toBe('content-length');
    });
  });

  describe('parseAutoDetect', () => {
    it('should use preferred newline format', () => {
      const message = createMessage(1);
      const buffer = Buffer.from(`${JSON.stringify(message)}\n`);

      const result = parseAutoDetect(buffer, 'newline');

      expect(result.format).toBe('newline');
      expect(result.messages).toHaveLength(1);
    });

    it('should use preferred content-length format', () => {
      const message = createMessage(1);
      const json = JSON.stringify(message);
      const buffer = Buffer.from(
        `Content-Length: ${json.length}\r\n\r\n${json}`,
      );

      const result = parseAutoDetect(buffer, 'content-length');

      expect(result.format).toBe('content-length');
      expect(result.messages).toHaveLength(1);
    });

    it('should auto-detect newline format', () => {
      const message = createMessage(1);
      const buffer = Buffer.from(`${JSON.stringify(message)}\n`);

      const result = parseAutoDetect(buffer);

      expect(result.format).toBe('newline');
      expect(result.messages).toHaveLength(1);
    });

    it('should auto-detect content-length format', () => {
      const message = createMessage(1);
      const json = JSON.stringify(message);
      const buffer = Buffer.from(
        `Content-Length: ${json.length}\r\n\r\n${json}`,
      );

      const result = parseAutoDetect(buffer);

      expect(result.format).toBe('content-length');
      expect(result.messages).toHaveLength(1);
    });

    it('should fall back to newline when format is unknown', () => {
      const buffer = Buffer.from('random data');

      const result = parseAutoDetect(buffer);

      expect(result.messages).toHaveLength(0);
      expect(result.remainingBuffer.toString()).toBe('random data');
    });
  });

  describe('helper functions', () => {
    it('findHeaderEnd should find header delimiter', () => {
      const buffer = Buffer.from('Header: value\r\n\r\nbody');
      const index = findHeaderEnd(buffer);
      expect(index).toBe(13);
    });

    it('findHeaderEnd should return -1 when delimiter not found', () => {
      const buffer = Buffer.from('Header: value\r\n');
      const index = findHeaderEnd(buffer);
      expect(index).toBe(-1);
    });

    it('extractContentLength should extract valid length', () => {
      const headers = 'Content-Length: 42\r\nOther-Header: value';
      const length = extractContentLength(headers);
      expect(length).toBe(42);
    });

    it('extractContentLength should handle whitespace', () => {
      const headers = 'Content-Length:  42  \r\n';
      const length = extractContentLength(headers);
      expect(length).toBe(42);
    });

    it('extractContentLength should return -1 for missing header', () => {
      const headers = 'Other-Header: value';
      const length = extractContentLength(headers);
      expect(length).toBe(-1);
    });
  });
});
