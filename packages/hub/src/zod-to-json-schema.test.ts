/**
 * Smoke test for zodToJsonSchema
 */

import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from './zod-to-json-schema.js';

describe('zodToJsonSchema (smoke)', () => {
  it('converts simple object with optional and described fields', () => {
    const schema = z.object({
      name: z.string().describe('Human name'),
      age: z.number().optional().describe('Age in years'),
      active: z.boolean()
    });

    const js = zodToJsonSchema(schema as any);
    expect(js.type).toBe('object');
    expect(js.properties.name.type).toBe('string');
    expect(js.properties.name.description).toBe('Human name');
    expect(js.properties.age.type).toBe('number');
    expect(js.properties.active.type).toBe('boolean');
    expect(js.required).toEqual(expect.arrayContaining(['name', 'active']));
  });
});
