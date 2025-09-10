import { describe, it, expect, vi } from 'vitest';
import { createEventEmitter } from './events.js';

describe('EventEmitter', () => {
  describe('Basic functionality', () => {
    it('should create an event emitter', () => {
      const emitter = createEventEmitter<string, unknown>();
      expect(emitter).toBeDefined();
      expect(emitter.on).toBeInstanceOf(Function);
      expect(emitter.off).toBeInstanceOf(Function);
      expect(emitter.emit).toBeInstanceOf(Function);
    });

    it('should register and trigger event handlers', () => {
      const emitter = createEventEmitter<string, { data: string }>();
      const handler = vi.fn();

      emitter.on('test', handler);
      emitter.emit('test', { data: 'hello' });

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler).toHaveBeenCalledWith({ data: 'hello' });
    });

    it('should support multiple handlers for the same event', () => {
      const emitter = createEventEmitter<string, number>();
      const handler1 = vi.fn();
      const handler2 = vi.fn();

      emitter.on('count', handler1);
      emitter.on('count', handler2);
      emitter.emit('count', 42);

      expect(handler1).toHaveBeenCalledWith(42);
      expect(handler2).toHaveBeenCalledWith(42);
    });

    it('should unregister event handlers', () => {
      const emitter = createEventEmitter<string, string>();
      const handler = vi.fn();

      emitter.on('message', handler);
      emitter.emit('message', 'first');
      expect(handler).toHaveBeenCalledTimes(1);

      emitter.off('message', handler);
      emitter.emit('message', 'second');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('should handle emit with no registered handlers', () => {
      const emitter = createEventEmitter<string, unknown>();
      expect(() => emitter.emit('nonexistent', {})).not.toThrow();
    });
  });

  describe('Error handling', () => {
    it('should catch and log handler errors without stopping other handlers', () => {
      const logger = {
        error: vi.fn()
      };
      const emitter = createEventEmitter<string, string>(logger as any);

      const errorHandler = vi.fn(() => {
        throw new Error('Handler error');
      });
      const successHandler = vi.fn();

      emitter.on('event', errorHandler);
      emitter.on('event', successHandler);
      emitter.emit('event', 'test');

      expect(errorHandler).toHaveBeenCalled();
      expect(successHandler).toHaveBeenCalled();
      expect(logger.error).toHaveBeenCalledWith('Error in event handler for event', {
        error: 'Handler error'
      });
    });

    it('should handle non-Error exceptions', () => {
      const logger = {
        error: vi.fn()
      };
      const emitter = createEventEmitter<string, unknown>(logger as any);

      const handler = vi.fn(() => {
        throw 'string error';
      });

      emitter.on('event', handler);
      emitter.emit('event', {});

      expect(logger.error).toHaveBeenCalledWith('Error in event handler for event', {
        error: 'string error'
      });
    });
  });

  describe('Hub event smoke tests', () => {
    it('should handle tool:registered event', () => {
      const emitter = createEventEmitter<string, unknown>();
      const handler = vi.fn();

      emitter.on('tool:registered', handler);
      const payload = {
        serverId: 'test-server',
        tool: {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {}
        }
      };
      emitter.emit('tool:registered', payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should handle resource:read event', () => {
      const emitter = createEventEmitter<string, unknown>();
      const handler = vi.fn();

      emitter.on('resource:read', handler);
      const payload = {
        uri: 'hatago://servers',
        serverId: '_internal',
        result: { contents: [] }
      };
      emitter.emit('resource:read', payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should handle prompt:registered event', () => {
      const emitter = createEventEmitter<string, unknown>();
      const handler = vi.fn();

      emitter.on('prompt:registered', handler);
      const payload = {
        serverId: 'test-server',
        prompt: {
          name: 'test_prompt',
          description: 'A test prompt',
          arguments: []
        }
      };
      emitter.emit('prompt:registered', payload);

      expect(handler).toHaveBeenCalledWith(payload);
    });

    it('should handle server lifecycle events', () => {
      const emitter = createEventEmitter<string, unknown>();
      const connectedHandler = vi.fn();
      const disconnectedHandler = vi.fn();
      const errorHandler = vi.fn();

      emitter.on('server:connected', connectedHandler);
      emitter.on('server:disconnected', disconnectedHandler);
      emitter.on('server:error', errorHandler);

      emitter.emit('server:connected', { serverId: 'test' });
      emitter.emit('server:error', { serverId: 'test', error: new Error('Test error') });
      emitter.emit('server:disconnected', { serverId: 'test' });

      expect(connectedHandler).toHaveBeenCalledWith({ serverId: 'test' });
      expect(errorHandler).toHaveBeenCalledWith({
        serverId: 'test',
        error: new Error('Test error')
      });
      expect(disconnectedHandler).toHaveBeenCalledWith({ serverId: 'test' });
    });
  });
});
