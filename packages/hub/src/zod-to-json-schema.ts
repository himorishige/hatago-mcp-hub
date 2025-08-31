/**
 * Simple Zod to JSON Schema converter for internal tools
 */

import type { z } from 'zod';

/**
 * Convert Zod schema to JSON Schema (simplified)
 */
export function zodToJsonSchema(schema: z.ZodObject<any>): any {
  const shape = (schema as any)._def.shape();
  const properties: any = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as any;
    const typeName = zodType._def.typeName;

    // Basic type mapping
    let jsonType = 'string';
    if (typeName === 'ZodBoolean') {
      jsonType = 'boolean';
    } else if (typeName === 'ZodNumber') {
      jsonType = 'number';
    } else if (typeName === 'ZodArray') {
      jsonType = 'array';
    } else if (typeName === 'ZodObject') {
      jsonType = 'object';
    }

    properties[key] = {
      type: jsonType
    };

    // Check if optional
    if (typeName === 'ZodOptional') {
      const innerType = zodType._def.innerType;
      const innerTypeName = innerType._def.typeName;

      let innerJsonType = 'string';
      if (innerTypeName === 'ZodBoolean') {
        innerJsonType = 'boolean';
      } else if (innerTypeName === 'ZodNumber') {
        innerJsonType = 'number';
      }

      properties[key] = {
        type: innerJsonType
      };

      // Add description if available
      if (zodType._def.description) {
        properties[key].description = zodType._def.description;
      }
    } else {
      required.push(key);
    }

    // Add description if available
    if (zodType._def.description) {
      properties[key].description = zodType._def.description;
    }
  }

  return {
    type: 'object',
    properties,
    required: required.length > 0 ? required : undefined
  };
}
