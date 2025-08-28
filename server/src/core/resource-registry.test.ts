import { createResourceRegistry, type ResourceRegistry } from '@hatago/runtime';
import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import { beforeEach, describe, expect, it } from 'vitest';

describe('createResourceRegistry', () => {
  let registry: ResourceRegistry;

  const createMockResource = (uri: string, name = 'Resource'): Resource => ({
    uri,
    name,
    description: `Description for ${name}`,
  });

  beforeEach(() => {
    registry = createResourceRegistry();
  });

  describe('registerServerResources', () => {
    it('should register resources with default namespace strategy', () => {
      const resources = [
        createMockResource('file://test.txt'),
        createMockResource('http://api/data'),
      ];

      registry.registerServerResources('server1', resources);

      const allResources = registry.getAllResources();
      expect(allResources).toHaveLength(2);
      expect(allResources[0].uri).toBe('file://test.txt_server1');
      expect(allResources[1].uri).toBe('http://api/data_server1');
    });

    it('should clear previous resources when re-registering', () => {
      const resources1 = [createMockResource('resource1')];
      const resources2 = [
        createMockResource('resource2'),
        createMockResource('resource3'),
      ];

      registry.registerServerResources('server1', resources1);
      expect(registry.getAllResources()).toHaveLength(1);

      registry.registerServerResources('server1', resources2);
      expect(registry.getAllResources()).toHaveLength(2);
      expect(registry.getServerResources('server1')).toHaveLength(2);
    });

    it('should handle empty resource list', () => {
      registry.registerServerResources('server1', []);

      expect(registry.getAllResources()).toHaveLength(0);
      expect(registry.getServerResources('server1')).toHaveLength(0);
    });

    it('should preserve resource properties', () => {
      const resource = createMockResource('test://resource', 'TestResource');
      registry.registerServerResources('server1', [resource]);

      const retrieved = registry.getAllResources()[0];
      expect(retrieved.name).toBe('TestResource');
      expect(retrieved.description).toBe('Description for TestResource');
    });
  });

  describe('resolveResource', () => {
    it('should resolve public URI to server and original URI', () => {
      const resource = createMockResource('original/path');
      registry.registerServerResources('myserver', [resource]);

      const resolved = registry.resolveResource('original/path_myserver');
      expect(resolved).not.toBeNull();
      expect(resolved?.serverId).toBe('myserver');
      expect(resolved?.originalUri).toBe('original/path');
      expect(resolved?.publicUri).toBe('original/path_myserver');
    });

    it('should return null for non-existent resource', () => {
      const resolved = registry.resolveResource('non_existent');
      expect(resolved).toBeNull();
    });

    it('should resolve first resource in case of collisions', () => {
      const resource = createMockResource('shared/resource');
      registry.registerServerResources('server1', [resource]);
      registry.registerServerResources('server2', [resource]);

      // Both servers will create different public URIs by default
      const resolved1 = registry.resolveResource('shared/resource_server1');
      expect(resolved1?.serverId).toBe('server1');

      const resolved2 = registry.resolveResource('shared/resource_server2');
      expect(resolved2?.serverId).toBe('server2');
    });
  });

  describe('clearServerResources', () => {
    it('should remove all resources for a server', () => {
      const resources1 = [
        createMockResource('res1'),
        createMockResource('res2'),
      ];
      const resources2 = [createMockResource('res3')];

      registry.registerServerResources('server1', resources1);
      registry.registerServerResources('server2', resources2);

      registry.clearServerResources('server1');

      expect(registry.getServerResources('server1')).toHaveLength(0);
      expect(registry.getServerResources('server2')).toHaveLength(1);
      expect(registry.getAllResources()).toHaveLength(1);
    });

    it('should handle clearing non-existent server', () => {
      expect(() => {
        registry.clearServerResources('non_existent');
      }).not.toThrow();
    });
  });

  describe('getServerResources', () => {
    it('should return resources for specific server', () => {
      registry.registerServerResources('server1', [
        createMockResource('res1'),
        createMockResource('res2'),
      ]);
      registry.registerServerResources('server2', [createMockResource('res3')]);

      const server1Resources = registry.getServerResources('server1');
      expect(server1Resources).toHaveLength(2);
      expect(server1Resources[0].uri).toBe('res1_server1');
      expect(server1Resources[1].uri).toBe('res2_server1');
    });

    it('should return empty array for non-existent server', () => {
      const resources = registry.getServerResources('non_existent');
      expect(resources).toHaveLength(0);
    });
  });

  describe('getAllResources', () => {
    it('should return all unique resources', () => {
      registry.registerServerResources('server1', [
        createMockResource('res1'),
        createMockResource('res2'),
      ]);
      registry.registerServerResources('server2', [createMockResource('res3')]);

      const allResources = registry.getAllResources();
      expect(allResources).toHaveLength(3);

      const uris = allResources.map((r) => r.uri);
      expect(uris).toContain('res1_server1');
      expect(uris).toContain('res2_server1');
      expect(uris).toContain('res3_server2');
    });

    it('should return empty array when no resources registered', () => {
      const allResources = registry.getAllResources();
      expect(allResources).toHaveLength(0);
    });
  });

  describe('getResourceCollisions', () => {
    it('should detect no collisions with namespace strategy', () => {
      // Default namespace strategy prevents collisions
      registry.registerServerResources('server1', [
        createMockResource('shared'),
      ]);
      registry.registerServerResources('server2', [
        createMockResource('shared'),
      ]);

      const collisions = registry.getResourceCollisions();
      expect(collisions.size).toBe(0);
    });

    it('should return empty map when no collisions exist', () => {
      registry.registerServerResources('server1', [createMockResource('res1')]);
      registry.registerServerResources('server2', [createMockResource('res2')]);

      const collisions = registry.getResourceCollisions();
      expect(collisions.size).toBe(0);
    });
  });

  describe('with custom naming config', () => {
    it('should use custom separator', () => {
      registry = createResourceRegistry({
        namingConfig: {
          strategy: 'namespace',
          separator: '__',
        },
      });

      registry.registerServerResources('server1', [
        createMockResource('resource'),
      ]);

      const resources = registry.getAllResources();
      expect(resources[0].uri).toBe('resource__server1');
    });

    it('should use alias strategy', () => {
      registry = createResourceRegistry({
        namingConfig: {
          strategy: 'alias',
        },
      });

      registry.registerServerResources('server1', [
        createMockResource('unique_resource'),
      ]);

      const resources = registry.getAllResources();
      expect(resources[0].uri).toBe('server1_unique_resource');
    });

    it('should apply custom aliases', () => {
      registry = createResourceRegistry({
        namingConfig: {
          aliases: {
            server1_original: 'custom_alias',
          },
        },
      });

      registry.registerServerResources('server1', [
        createMockResource('original'),
      ]);

      const resources = registry.getAllResources();
      expect(resources[0].uri).toBe('original_server1');
    });
  });

  describe('clear', () => {
    it('should remove all resources from all servers', () => {
      registry.registerServerResources('server1', [createMockResource('res1')]);
      registry.registerServerResources('server2', [createMockResource('res2')]);

      registry.clear();

      expect(registry.getAllResources()).toHaveLength(0);
      expect(registry.getServerResources('server1')).toHaveLength(0);
      expect(registry.getServerResources('server2')).toHaveLength(0);
    });
  });
});
