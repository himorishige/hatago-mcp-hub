import { describe, expect, it } from 'vitest';
import { ErrorHelpers } from './errors.js';
import {
  combine,
  err,
  flatMap,
  fromPromise,
  isErr,
  isOk,
  map,
  mapErr,
  ok,
  toPromise,
  tryCatch,
  tryCatchAsync,
  unwrap,
  unwrapOr,
  unwrapOrElse,
} from './result.js';

describe('Result type', () => {
  describe('creation', () => {
    it('should create Ok result', () => {
      const result = ok(42);
      expect(result.ok).toBe(true);
      expect(result.value).toBe(42);
    });

    it('should create Err result', () => {
      const error = ErrorHelpers.invalidConfiguration();
      const result = err(error);
      expect(result.ok).toBe(false);
      expect(result.error).toBe(error);
    });
  });

  describe('type guards', () => {
    it('should identify Ok result', () => {
      const result = ok(42);
      expect(isOk(result)).toBe(true);
      expect(isErr(result)).toBe(false);
    });

    it('should identify Err result', () => {
      const result = err(ErrorHelpers.invalidConfiguration());
      expect(isOk(result)).toBe(false);
      expect(isErr(result)).toBe(true);
    });
  });

  describe('map', () => {
    it('should map over Ok result', () => {
      const result = ok(42);
      const mapped = map(result, (x) => x * 2);
      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(84);
      }
    });

    it('should not map over Err result', () => {
      const error = ErrorHelpers.invalidConfiguration();
      const result = err(error);
      const mapped = map(result, (x: number) => x * 2);
      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error).toBe(error);
      }
    });
  });

  describe('mapErr', () => {
    it('should not map error on Ok result', () => {
      const result = ok(42);
      const mapped = mapErr(result, () =>
        ErrorHelpers.mcpConnectionFailed('test'),
      );
      expect(isOk(mapped)).toBe(true);
      if (isOk(mapped)) {
        expect(mapped.value).toBe(42);
      }
    });

    it('should map error on Err result', () => {
      const result = err(ErrorHelpers.invalidConfiguration());
      const mapped = mapErr(result, () =>
        ErrorHelpers.mcpConnectionFailed('test'),
      );
      expect(isErr(mapped)).toBe(true);
      if (isErr(mapped)) {
        expect(mapped.error.code).toBe('E_MCP_CONNECTION_FAILED');
      }
    });
  });

  describe('flatMap', () => {
    it('should chain Ok results', () => {
      const result = ok(42);
      const chained = flatMap(result, (x) => ok(x * 2));
      expect(isOk(chained)).toBe(true);
      if (isOk(chained)) {
        expect(chained.value).toBe(84);
      }
    });

    it('should not chain on Err result', () => {
      const error = ErrorHelpers.invalidConfiguration();
      const result = err(error);
      const chained = flatMap(result, (x: number) => ok(x * 2));
      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error).toBe(error);
      }
    });

    it('should propagate error from chained operation', () => {
      const result = ok(42);
      const chained = flatMap(result, () =>
        err(ErrorHelpers.mcpConnectionFailed('test')),
      );
      expect(isErr(chained)).toBe(true);
      if (isErr(chained)) {
        expect(chained.error.code).toBe('E_MCP_CONNECTION_FAILED');
      }
    });
  });

  describe('unwrap', () => {
    it('should unwrap Ok result', () => {
      const result = ok(42);
      expect(unwrap(result)).toBe(42);
    });

    it('should throw on Err result', () => {
      const error = ErrorHelpers.invalidConfiguration();
      const result = err(error);
      expect(() => unwrap(result)).toThrow();
    });
  });

  describe('unwrapOr', () => {
    it('should return value on Ok result', () => {
      const result = ok(42);
      expect(unwrapOr(result, 0)).toBe(42);
    });

    it('should return default on Err result', () => {
      const result = err(ErrorHelpers.invalidConfiguration());
      expect(unwrapOr(result, 0)).toBe(0);
    });
  });

  describe('unwrapOrElse', () => {
    it('should return value on Ok result', () => {
      const result = ok(42);
      expect(unwrapOrElse(result, () => 0)).toBe(42);
    });

    it('should compute default on Err result', () => {
      const result = err(ErrorHelpers.invalidConfiguration());
      expect(unwrapOrElse(result, () => 100)).toBe(100);
    });
  });

  describe('fromPromise', () => {
    it('should convert resolved promise to Ok', async () => {
      const promise = Promise.resolve(42);
      const result = await fromPromise(promise);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should convert rejected promise to Err', async () => {
      const error = ErrorHelpers.invalidConfiguration();
      const promise = Promise.reject(error);
      const result = await fromPromise(promise);
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error).toBe(error);
      }
    });

    it('should use error mapper for rejected promise', async () => {
      const promise = Promise.reject(new Error('test'));
      const result = await fromPromise(promise, () =>
        ErrorHelpers.mcpConnectionFailed('mapped'),
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('E_MCP_CONNECTION_FAILED');
      }
    });
  });

  describe('toPromise', () => {
    it('should convert Ok to resolved promise', async () => {
      const result = ok(42);
      const value = await toPromise(result);
      expect(value).toBe(42);
    });

    it('should convert Err to rejected promise', async () => {
      const error = ErrorHelpers.invalidConfiguration();
      const result = err(error);
      await expect(toPromise(result)).rejects.toBe(error);
    });
  });

  describe('combine', () => {
    it('should combine all Ok results', () => {
      const results = [ok(1), ok(2), ok(3)];
      const combined = combine(results);
      expect(isOk(combined)).toBe(true);
      if (isOk(combined)) {
        expect(combined.value).toEqual([1, 2, 3]);
      }
    });

    it('should return first error', () => {
      const error = ErrorHelpers.invalidConfiguration();
      const results = [ok(1), err(error), ok(3)];
      const combined = combine(results);
      expect(isErr(combined)).toBe(true);
      if (isErr(combined)) {
        expect(combined.error).toBe(error);
      }
    });
  });

  describe('tryCatch', () => {
    it('should return Ok for successful operation', () => {
      const result = tryCatch(() => 42);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should return Err for throwing operation', () => {
      const result = tryCatch(() => {
        throw new Error('test');
      });
      expect(isErr(result)).toBe(true);
    });

    it('should use error mapper', () => {
      const result = tryCatch(
        () => {
          throw new Error('test');
        },
        () => ErrorHelpers.mcpConnectionFailed('mapped'),
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('E_MCP_CONNECTION_FAILED');
      }
    });
  });

  describe('tryCatchAsync', () => {
    it('should return Ok for successful async operation', async () => {
      const result = await tryCatchAsync(async () => 42);
      expect(isOk(result)).toBe(true);
      if (isOk(result)) {
        expect(result.value).toBe(42);
      }
    });

    it('should return Err for throwing async operation', async () => {
      const result = await tryCatchAsync(async () => {
        throw new Error('test');
      });
      expect(isErr(result)).toBe(true);
    });

    it('should use error mapper for async', async () => {
      const result = await tryCatchAsync(
        async () => {
          throw new Error('test');
        },
        () => ErrorHelpers.mcpConnectionFailed('mapped'),
      );
      expect(isErr(result)).toBe(true);
      if (isErr(result)) {
        expect(result.error.code).toBe('E_MCP_CONNECTION_FAILED');
      }
    });
  });
});
