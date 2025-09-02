/**
 * Deep merge utility for configuration inheritance
 */

// Dangerous keys that should never be merged to prevent prototype pollution
const DANGEROUS_KEYS = new Set([
  '__proto__',
  'constructor',
  'prototype',
  'toString',
  'valueOf',
  'hasOwnProperty',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__'
]);

/**
 * Check if value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  // Fast bail-outs
  if (Object.prototype.toString.call(value) !== '[object Object]') {
    return false;
  }

  // Accept objects with null prototype or Object prototype only
  const proto = Reflect.getPrototypeOf(value as object);
  return proto === null || proto === Object.prototype;
}

/**
 * Merge environment variables with special null handling
 */
function mergeEnv(
  target: Record<string, unknown>,
  source: Record<string, unknown>
): Record<string, unknown> {
  const result = { ...target };

  for (const key in source) {
    if (source[key] === null) {
      // null means delete the key
      delete result[key];
    } else {
      result[key] = source[key];
    }
  }

  return result;
}

/**
 * Deep merge two configuration objects
 *
 * Merge rules:
 * - Arrays: replace (no concatenation in MVP)
 * - Objects: deep merge recursively
 * - Primitives: source overwrites target
 * - null in env: deletes the key
 *
 * @param target Base configuration
 * @param source Configuration to merge in
 * @returns Merged configuration
 */
export function deepMerge<T = unknown>(target: unknown, source: unknown): T {
  // Handle null source (special case for env deletion)
  if (source === null) {
    return null as T;
  }

  // Arrays are replaced, not concatenated (MVP behavior)
  if (Array.isArray(source)) {
    return source as T;
  }

  // Deep merge objects
  if (isPlainObject(source) && isPlainObject(target)) {
    const result: Record<string, unknown> = {};

    // Copy target properties first
    for (const key in target) {
      if (Object.prototype.hasOwnProperty.call(target, key)) {
        result[key] = target[key];
      }
    }

    for (const key in source) {
      // Prototype pollution protection
      if (DANGEROUS_KEYS.has(key)) {
        continue;
      }

      // Special handling for env field
      if (key === 'env' && isPlainObject(result[key]) && isPlainObject(source[key])) {
        result[key] = mergeEnv(result[key], source[key]);
      } else {
        result[key] = deepMerge(result[key], source[key]);
      }
    }

    return result as T;
  }

  // Primitives and other types: source overwrites target
  return source as T;
}

/**
 * Merge multiple configurations in order
 *
 * @param configs Array of configurations to merge
 * @returns Merged configuration
 */
export function mergeConfigs<T = unknown>(configs: unknown[]): T {
  if (configs.length === 0) {
    return {} as T;
  }

  return configs.reduce((acc, config) => deepMerge<T>(acc, config), {} as unknown) as T;
}
