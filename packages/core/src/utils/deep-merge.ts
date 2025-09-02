/**
 * Deep merge utility for configuration inheritance
 */

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
export function deepMerge(target: unknown, source: unknown): unknown {
  // Handle null source (special case for env deletion)
  if (source === null) {
    return null;
  }

  // Arrays are replaced, not concatenated (MVP behavior)
  if (Array.isArray(source)) {
    return source;
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
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
        continue;
      }

      // Special handling for env field
      if (key === 'env' && isPlainObject(result[key]) && isPlainObject(source[key])) {
        result[key] = mergeEnv(result[key], source[key]);
      } else {
        result[key] = deepMerge(result[key], source[key]);
      }
    }

    return result;
  }

  // Primitives and other types: source overwrites target
  return source;
}

/**
 * Merge multiple configurations in order
 *
 * @param configs Array of configurations to merge
 * @returns Merged configuration
 */
export function mergeConfigs(configs: unknown[]): unknown {
  if (configs.length === 0) {
    return {};
  }

  return configs.reduce((acc, config) => deepMerge(acc, config), {});
}
