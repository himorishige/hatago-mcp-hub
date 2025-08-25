/**
 * Protocol Tests
 *
 * Basic tests for protocol components.
 */

import { describe, expect, it } from 'vitest';
import {
  ErrorType,
  HatagoProtocolError,
  StreamFrameHandler,
} from '../protocol/index.js';

describe('HatagoProtocolError', () => {
  it('should create user errors correctly', () => {
    const error = HatagoProtocolError.userError('Invalid input');

    expect(error.type).toBe(ErrorType.UserError);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('Invalid input');
  });

  it('should create system errors correctly', () => {
    const error = HatagoProtocolError.systemError('Network failure');

    expect(error.type).toBe(ErrorType.SystemError);
    expect(error.retryable).toBe(true);
    expect(error.message).toBe('Network failure');
  });

  it('should create policy errors correctly', () => {
    const error = HatagoProtocolError.policyError('Unauthorized');

    expect(error.type).toBe(ErrorType.PolicyError);
    expect(error.retryable).toBe(false);
    expect(error.message).toBe('Unauthorized');
  });

  it('should convert from generic errors', () => {
    const originalError = new Error('Something went wrong');
    const converted = HatagoProtocolError.fromError(originalError);

    expect(converted).toBeInstanceOf(HatagoProtocolError);
    expect(converted.message).toBe('Something went wrong');
    expect(converted.type).toBe(ErrorType.SystemError);
  });

  it('should serialize to JSON correctly', () => {
    const error = HatagoProtocolError.userError('Test error', {
      id: 'test-123',
      serverName: 'test-server',
    });

    const json = error.toJSON();

    expect(json.jsonrpc).toBe('2.0');
    expect(json.id).toBe('test-123');
    expect(json.message).toBe('Test error');
    expect(json.type).toBe(ErrorType.UserError);
    expect(json.serverName).toBe('test-server');
  });
});

describe('StreamFrameHandler', () => {
  it('should create frames with correct structure', () => {
    const handler = new StreamFrameHandler();

    const frame = handler.createFrame('data', 'test-stream', { value: 42 });

    expect(frame.type).toBe('data');
    expect(frame.id).toBe('test-stream');
    expect(frame.seq).toBe(1);
    expect(frame.payload).toEqual({ value: 42 });
    expect(frame.timestamp).toBeTypeOf('number');
  });

  it('should increment sequence numbers', () => {
    const handler = new StreamFrameHandler();

    const frame1 = handler.createFrame('data', 'test-stream', 'first');
    const frame2 = handler.createFrame('data', 'test-stream', 'second');

    expect(frame1.seq).toBe(1);
    expect(frame2.seq).toBe(2);
  });

  it('should track active streams', () => {
    const handler = new StreamFrameHandler();

    expect(handler.getActiveStreamCount()).toBe(0);
    expect(handler.isStreamActive('test')).toBe(false);

    handler.createFrame('data', 'test', 'payload');

    expect(handler.getActiveStreamCount()).toBe(1);
    expect(handler.isStreamActive('test')).toBe(true);

    handler.createFrame('end', 'test');

    expect(handler.getActiveStreamCount()).toBe(0);
    expect(handler.isStreamActive('test')).toBe(false);
  });

  it('should validate frames correctly', () => {
    const handler = new StreamFrameHandler();

    const validFrame = {
      type: 'data',
      id: 'test',
      seq: 1,
      timestamp: Date.now(),
      payload: 'test',
    };

    expect(() => handler.validateFrame(validFrame)).not.toThrow();

    const invalidFrame = {
      type: 'invalid',
      id: 'test',
      seq: 1,
      timestamp: Date.now(),
    };

    expect(() => handler.validateFrame(invalidFrame)).toThrow();
  });

  it('should enforce frame size limits', () => {
    const handler = new StreamFrameHandler({ maxFrameSize: 100 });

    const largePayload = 'x'.repeat(200);

    expect(() => {
      handler.createFrame('data', 'test', largePayload);
    }).toThrow(/Frame size .* exceeds maximum/);
  });
});
