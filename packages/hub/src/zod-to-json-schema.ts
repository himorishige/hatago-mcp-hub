/**
 * Simple Zod to JSON Schema converter for internal tools
 */

import type { z } from 'zod';

interface ZodDefWithShape {
  shape: () => Record<string, unknown>;
}

interface ZodDefWithTypeName {
  typeName: string;
  description?: string;
  innerType?: {
    _def: ZodDefWithTypeName;
  };
}

interface JsonSchemaProperty {
  type: string;
  description?: string;
}

interface JsonSchema {
  type: string;
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
}

/**
 * Convert Zod schema to JSON Schema (simplified)
 */
export function zodToJsonSchema(schema: z.ZodObject<z.ZodRawShape>): JsonSchema {
  const schemaWithDef = schema as unknown as { _def: ZodDefWithShape };
  const shape = schemaWithDef._def.shape();
  const properties: Record<string, JsonSchemaProperty> = {};
  const required: string[] = [];

  for (const [key, value] of Object.entries(shape)) {
    const zodType = value as { _def: ZodDefWithTypeName };
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
      if (innerType) {
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
      }

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
