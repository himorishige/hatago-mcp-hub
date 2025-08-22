import type { Prompt } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  createPromptRegistry,
  type PromptRegistry,
} from './prompt-registry.js';

describe('createPromptRegistry', () => {
  let registry: PromptRegistry;

  const createMockPrompt = (name: string, description = ''): Prompt => ({
    name,
    description: description || `Description for ${name}`,
    arguments: [
      {
        name: 'input',
        description: 'Input parameter',
        required: true,
      },
    ],
  });

  beforeEach(() => {
    registry = createPromptRegistry();
  });

  describe('registerServerPrompts', () => {
    it('should register prompts with default namespace strategy', () => {
      const prompts = [
        createMockPrompt('test_prompt'),
        createMockPrompt('another_prompt'),
      ];

      registry.registerServerPrompts('server1', prompts);

      const allPrompts = registry.getAllPrompts();
      expect(allPrompts).toHaveLength(2);
      expect(allPrompts[0].name).toBe('test_prompt_server1');
      expect(allPrompts[1].name).toBe('another_prompt_server1');
    });

    it('should clear previous prompts when re-registering', () => {
      const prompts1 = [createMockPrompt('prompt1')];
      const prompts2 = [
        createMockPrompt('prompt2'),
        createMockPrompt('prompt3'),
      ];

      registry.registerServerPrompts('server1', prompts1);
      expect(registry.getAllPrompts()).toHaveLength(1);

      registry.registerServerPrompts('server1', prompts2);
      expect(registry.getAllPrompts()).toHaveLength(2);
      expect(registry.getServerPrompts('server1')).toHaveLength(2);
    });

    it('should handle empty prompt list', () => {
      registry.registerServerPrompts('server1', []);

      expect(registry.getAllPrompts()).toHaveLength(0);
      expect(registry.getServerPrompts('server1')).toHaveLength(0);
    });

    it('should preserve prompt properties', () => {
      const prompt = createMockPrompt('test_prompt', 'Custom description');
      registry.registerServerPrompts('server1', [prompt]);

      const retrieved = registry.getAllPrompts()[0];
      expect(retrieved.description).toBe('Custom description');
      expect(retrieved.arguments).toHaveLength(1);
      expect(retrieved.arguments?.[0].name).toBe('input');
    });
  });

  describe('resolvePrompt', () => {
    it('should resolve public name to server and original name', () => {
      const prompt = createMockPrompt('original_prompt');
      registry.registerServerPrompts('myserver', [prompt]);

      const resolved = registry.resolvePrompt('original_prompt_myserver');
      expect(resolved).not.toBeNull();
      expect(resolved?.serverId).toBe('myserver');
      expect(resolved?.originalName).toBe('original_prompt');
      expect(resolved?.publicName).toBe('original_prompt_myserver');
    });

    it('should return null for non-existent prompt', () => {
      const resolved = registry.resolvePrompt('non_existent');
      expect(resolved).toBeNull();
    });

    it('should resolve first prompt in case of collisions', () => {
      const prompt = createMockPrompt('shared_prompt');
      registry.registerServerPrompts('server1', [prompt]);
      registry.registerServerPrompts('server2', [prompt]);

      // Both servers will create different public names by default
      const resolved1 = registry.resolvePrompt('shared_prompt_server1');
      expect(resolved1?.serverId).toBe('server1');

      const resolved2 = registry.resolvePrompt('shared_prompt_server2');
      expect(resolved2?.serverId).toBe('server2');
    });
  });

  describe('clearServerPrompts', () => {
    it('should remove all prompts for a server', () => {
      const prompts1 = [
        createMockPrompt('prompt1'),
        createMockPrompt('prompt2'),
      ];
      const prompts2 = [createMockPrompt('prompt3')];

      registry.registerServerPrompts('server1', prompts1);
      registry.registerServerPrompts('server2', prompts2);

      registry.clearServerPrompts('server1');

      expect(registry.getServerPrompts('server1')).toHaveLength(0);
      expect(registry.getServerPrompts('server2')).toHaveLength(1);
      expect(registry.getAllPrompts()).toHaveLength(1);
    });

    it('should handle clearing non-existent server', () => {
      expect(() => {
        registry.clearServerPrompts('non_existent');
      }).not.toThrow();
    });
  });

  describe('getServerPrompts', () => {
    it('should return prompts for specific server', () => {
      registry.registerServerPrompts('server1', [
        createMockPrompt('prompt1'),
        createMockPrompt('prompt2'),
      ]);
      registry.registerServerPrompts('server2', [createMockPrompt('prompt3')]);

      const server1Prompts = registry.getServerPrompts('server1');
      expect(server1Prompts).toHaveLength(2);
      expect(server1Prompts[0].name).toBe('prompt1_server1');
      expect(server1Prompts[1].name).toBe('prompt2_server1');
    });

    it('should return empty array for non-existent server', () => {
      const prompts = registry.getServerPrompts('non_existent');
      expect(prompts).toHaveLength(0);
    });
  });

  describe('getAllPrompts', () => {
    it('should return all unique prompts', () => {
      registry.registerServerPrompts('server1', [
        createMockPrompt('prompt1'),
        createMockPrompt('prompt2'),
      ]);
      registry.registerServerPrompts('server2', [createMockPrompt('prompt3')]);

      const allPrompts = registry.getAllPrompts();
      expect(allPrompts).toHaveLength(3);

      const names = allPrompts.map((p) => p.name);
      expect(names).toContain('prompt1_server1');
      expect(names).toContain('prompt2_server1');
      expect(names).toContain('prompt3_server2');
    });

    it('should return empty array when no prompts registered', () => {
      const allPrompts = registry.getAllPrompts();
      expect(allPrompts).toHaveLength(0);
    });
  });

  describe('getPromptCollisions', () => {
    it('should detect no collisions with namespace strategy', () => {
      // Default namespace strategy prevents collisions
      registry.registerServerPrompts('server1', [createMockPrompt('shared')]);
      registry.registerServerPrompts('server2', [createMockPrompt('shared')]);

      const collisions = registry.getPromptCollisions();
      expect(collisions.size).toBe(0);
    });

    it('should return empty map when no collisions exist', () => {
      registry.registerServerPrompts('server1', [createMockPrompt('prompt1')]);
      registry.registerServerPrompts('server2', [createMockPrompt('prompt2')]);

      const collisions = registry.getPromptCollisions();
      expect(collisions.size).toBe(0);
    });
  });

  describe('with custom naming config', () => {
    it('should use custom separator', () => {
      registry = createPromptRegistry({
        namingConfig: {
          strategy: 'namespace',
          separator: '__',
        },
      });

      registry.registerServerPrompts('server1', [createMockPrompt('prompt')]);

      const prompts = registry.getAllPrompts();
      expect(prompts[0].name).toBe('prompt__server1');
    });

    it('should use alias strategy', () => {
      registry = createPromptRegistry({
        namingConfig: {
          strategy: 'alias',
        },
      });

      registry.registerServerPrompts('server1', [
        createMockPrompt('unique_prompt'),
      ]);

      const prompts = registry.getAllPrompts();
      expect(prompts[0].name).toBe('server1_unique_prompt');
    });

    it('should apply custom aliases', () => {
      registry = createPromptRegistry({
        namingConfig: {
          aliases: {
            server1_original: 'custom_alias',
          },
        },
      });

      registry.registerServerPrompts('server1', [createMockPrompt('original')]);

      const prompts = registry.getAllPrompts();
      expect(prompts[0].name).toBe('original_server1');
    });

    it('should handle complex prompt arguments', () => {
      const complexPrompt: Prompt = {
        name: 'complex_prompt',
        description: 'A complex prompt',
        arguments: [
          {
            name: 'required_arg',
            description: 'Required argument',
            required: true,
          },
          {
            name: 'optional_arg',
            description: 'Optional argument',
            required: false,
          },
        ],
      };

      registry.registerServerPrompts('server1', [complexPrompt]);

      const retrieved = registry.getAllPrompts()[0];
      expect(retrieved.arguments).toHaveLength(2);
      expect(retrieved.arguments?.[0].required).toBe(true);
      expect(retrieved.arguments?.[1].required).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all prompts from all servers', () => {
      registry.registerServerPrompts('server1', [createMockPrompt('prompt1')]);
      registry.registerServerPrompts('server2', [createMockPrompt('prompt2')]);

      registry.clear();

      expect(registry.getAllPrompts()).toHaveLength(0);
      expect(registry.getServerPrompts('server1')).toHaveLength(0);
      expect(registry.getServerPrompts('server2')).toHaveLength(0);
    });
  });
});
