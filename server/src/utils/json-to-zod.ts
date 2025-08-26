import { z } from 'zod';

// Type definitions for JSON Schema
type JsonSchema = {
  type?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minItems?: number;
  maxItems?: number;
  additionalProperties?: boolean | JsonSchema;
  _def?: unknown; // Zod internal property
};

/**
 * JSON Schema to Zod converter
 *
 * MCP SDK expects Zod schemas, but we have JSON schemas.
 * This converts JSON schemas to actual Zod schemas dynamically.
 */

/**
 * Convert JSON Schema to Zod schema
 * Returns a Zod shape object (not z.object) as MCP SDK expects
 */
export function createZodLikeSchema(jsonSchema?: JsonSchema): unknown {
  // If no schema, return undefined (no validation)
  if (!jsonSchema) {
    return undefined;
  }

  // If it's already a Zod schema, return as-is
  if (jsonSchema._def) {
    return jsonSchema;
  }

  // Convert JSON Schema to Zod shape
  if (jsonSchema.type === 'object' && jsonSchema.properties) {
    const shape: Record<string, unknown> = {};

    for (const [key, propSchema] of Object.entries(jsonSchema.properties)) {
      shape[key] = convertJsonSchemaToZod(propSchema);
    }

    // Return the shape object, not z.object(shape)
    // This is what MCP SDK expects
    return shape;
  }

  // For non-object schemas, convert and return the Zod schema
  return convertJsonSchemaToZod(jsonSchema);
}

/**
 * Convert a single JSON Schema property to Zod schema
 */
function convertJsonSchemaToZod(schema: JsonSchema | undefined): z.ZodTypeAny {
  if (!schema) {
    return z.any();
  }

  // Handle type-specific conversions
  switch (schema.type) {
    case 'string': {
      let stringSchema = z.string();
      if (schema.minLength !== undefined) {
        stringSchema = stringSchema.min(schema.minLength);
      }
      if (schema.maxLength !== undefined) {
        stringSchema = stringSchema.max(schema.maxLength);
      }
      if (schema.pattern !== undefined) {
        stringSchema = stringSchema.regex(new RegExp(schema.pattern));
      }
      if (schema.enum !== undefined) {
        return z.enum(schema.enum as [string, ...string[]]);
      }
      return stringSchema;
    }

    case 'number':
    case 'integer': {
      let numberSchema =
        schema.type === 'integer' ? z.number().int() : z.number();
      if (schema.minimum !== undefined) {
        numberSchema = numberSchema.min(schema.minimum);
      }
      if (schema.maximum !== undefined) {
        numberSchema = numberSchema.max(schema.maximum);
      }
      return numberSchema;
    }

    case 'boolean':
      return z.boolean();

    case 'array': {
      const itemSchema = schema.items
        ? convertJsonSchemaToZod(schema.items)
        : z.any();
      let arraySchema = z.array(itemSchema);
      if (schema.minItems !== undefined) {
        arraySchema = arraySchema.min(schema.minItems);
      }
      if (schema.maxItems !== undefined) {
        arraySchema = arraySchema.max(schema.maxItems);
      }
      return arraySchema;
    }

    case 'object':
      if (schema.properties) {
        const shape: Record<string, z.ZodTypeAny> = {};
        for (const [key, propSchema] of Object.entries(schema.properties)) {
          shape[key] = convertJsonSchemaToZod(propSchema);
        }

        let objectSchema = z.object(shape);

        // Handle required fields
        if (!schema.required || schema.required.length === 0) {
          // Make all fields optional if no required array
          objectSchema = objectSchema.partial();
        } else if (schema.required.length < Object.keys(shape).length) {
          // Some fields are optional
          const optionalKeys = Object.keys(shape).filter(
            (key) => !schema.required?.includes(key),
          );
          objectSchema = objectSchema.partial(
            optionalKeys.reduce(
              (acc, key) => {
                acc[key] = true;
                return acc;
              },
              {} as Record<string, true>,
            ),
          );
        }

        // Handle additionalProperties
        if (schema.additionalProperties === false) {
          objectSchema = objectSchema.strict() as any;
        } else if (schema.additionalProperties === true) {
          objectSchema = objectSchema.passthrough() as any;
        }

        return objectSchema;
      }

      // Object without properties
      if (schema.additionalProperties === false) {
        return z.object({}).strict();
      }
      return z.record(z.any());

    case 'null':
      return z.null();

    default:
      // Unknown type or any
      return z.any();
  }
}
