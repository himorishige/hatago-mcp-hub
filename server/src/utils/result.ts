/**
 * Result type for functional error handling
 * Following Hatago principles for explicit error handling
 */

import type { HatagoError } from './errors.js';

/**
 * Success result
 */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/**
 * Error result
 */
export interface Err<E = HatagoError> {
  readonly ok: false;
  readonly error: E;
}

/**
 * Result type - Either Ok or Err
 */
export type Result<T, E = HatagoError> = Ok<T> | Err<E>;

/**
 * Type guard to check if result is Ok
 */
export const isOk = <T, E>(result: Result<T, E>): result is Ok<T> => result.ok;

/**
 * Type guard to check if result is Err
 */
export const isErr = <T, E>(result: Result<T, E>): result is Err<E> =>
  !result.ok;

/**
 * Create a success result
 */
export const ok = <T>(value: T): Ok<T> => ({
  ok: true,
  value,
});

/**
 * Create an error result
 */
export const err = <E = HatagoError>(error: E): Err<E> => ({
  ok: false,
  error,
});

/**
 * Map over a successful result
 */
export const map = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => U,
): Result<U, E> => {
  if (isOk(result)) {
    return ok(fn(result.value));
  }
  return result;
};

/**
 * Map over an error result
 */
export const mapErr = <T, E, F>(
  result: Result<T, E>,
  fn: (error: E) => F,
): Result<T, F> => {
  if (isErr(result)) {
    return err(fn(result.error));
  }
  return result;
};

/**
 * Chain Result computations
 */
export const flatMap = <T, U, E>(
  result: Result<T, E>,
  fn: (value: T) => Result<U, E>,
): Result<U, E> => {
  if (isOk(result)) {
    return fn(result.value);
  }
  return result;
};

/**
 * Unwrap result or throw error
 */
export const unwrap = <T, E>(result: Result<T, E>): T => {
  if (isOk(result)) {
    return result.value;
  }
  throw result.error;
};

/**
 * Unwrap result or return default value
 */
export const unwrapOr = <T, E>(result: Result<T, E>, defaultValue: T): T => {
  if (isOk(result)) {
    return result.value;
  }
  return defaultValue;
};

/**
 * Unwrap result or compute default value
 */
export const unwrapOrElse = <T, E>(
  result: Result<T, E>,
  fn: (error: E) => T,
): T => {
  if (isOk(result)) {
    return result.value;
  }
  return fn(result.error);
};

/**
 * Convert promise to Result
 */
export const fromPromise = async <T, E = HatagoError>(
  promise: Promise<T>,
  errorMapper?: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    const value = await promise;
    return ok(value);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
};

/**
 * Convert Result to promise
 */
export const toPromise = <T, E>(result: Result<T, E>): Promise<T> => {
  if (isOk(result)) {
    return Promise.resolve(result.value);
  }
  return Promise.reject(result.error);
};

/**
 * Combine multiple Results
 */
export const combine = <T, E>(results: Result<T, E>[]): Result<T[], E> => {
  const values: T[] = [];
  for (const result of results) {
    if (isErr(result)) {
      return result;
    }
    values.push(result.value);
  }
  return ok(values);
};

/**
 * Try/catch wrapper that returns Result
 */
export const tryCatch = <T, E = HatagoError>(
  fn: () => T,
  errorMapper?: (error: unknown) => E,
): Result<T, E> => {
  try {
    return ok(fn());
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
};

/**
 * Async try/catch wrapper that returns Result
 */
export const tryCatchAsync = async <T, E = HatagoError>(
  fn: () => Promise<T>,
  errorMapper?: (error: unknown) => E,
): Promise<Result<T, E>> => {
  try {
    const value = await fn();
    return ok(value);
  } catch (error) {
    if (errorMapper) {
      return err(errorMapper(error));
    }
    return err(error as E);
  }
};
