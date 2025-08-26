/**
 * Zod-like schema creation utility
 * Creates Zod-compatible schemas from JSON Schema
 */

import { z } from 'zod';

/**
 * Convert JSON Schema to Zod schema
 */
export function createZodLikeSchema(jsonSchema: any): z.ZodSchema {
  // Simple implementation for basic types
  if (!jsonSchema) {
    return z.any();
  }

  // Handle type-based schemas
  if (jsonSchema.type === 'object') {
    const shape: Record<string, z.ZodSchema> = {};

    if (jsonSchema.properties) {
      for (const [key, value] of Object.entries(jsonSchema.properties)) {
        shape[key] = createZodLikeSchema(value);
      }
    }

    let schema = z.object(shape);

    // Handle required fields
    if (!jsonSchema.required || jsonSchema.required.length === 0) {
      // Make all fields optional if no required array
      schema = schema.partial() as any;
    }

    return schema;
  }

  if (jsonSchema.type === 'string') {
    return z.string();
  }

  if (jsonSchema.type === 'number') {
    return z.number();
  }

  if (jsonSchema.type === 'boolean') {
    return z.boolean();
  }

  if (jsonSchema.type === 'array') {
    const itemSchema = jsonSchema.items
      ? createZodLikeSchema(jsonSchema.items)
      : z.any();
    return z.array(itemSchema);
  }

  // Default to any for unknown types
  return z.any();
}
