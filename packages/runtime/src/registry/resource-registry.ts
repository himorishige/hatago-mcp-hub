import type { Resource } from '@modelcontextprotocol/sdk/types.js';
import type { ToolNamingConfig } from './types.js';
import {
  createNamingFunction,
  createParsingFunction,
} from '../utils/naming-strategy.js';

export interface ResourceMetadata extends Resource {
  serverId: string;
  originalUri: string;
}

export interface ResourceResolveResult {
  serverId: string;
  originalUri: string;
  publicUri: string;
}

export interface ResourceRegistryOptions {
  namingConfig?: ToolNamingConfig;
}

export interface ResourceRegistry {
  registerServerResources: (serverId: string, resources: Resource[]) => void;
  clearServerResources: (serverId: string) => void;
  resolveResource: (publicUri: string) => ResourceResolveResult | null;
  getServerResources: (serverId: string) => Resource[];
  getAllResources: () => Resource[];
  getResourceCollisions: () => Map<string, string[]>;
  getResourceCount: () => number;
  clear: () => void;
}

/**
 * Create a resource registry for managing resources from multiple MCP servers
 * Using functional factory pattern for better adherence to Hatago principles
 */
export function createResourceRegistry(
  options: ResourceRegistryOptions = {},
): ResourceRegistry {
  // Private state managed through closure
  const resources = new Map<string, ResourceMetadata[]>();
  const serverResources = new Map<string, Set<string>>();
  const namingConfig: ToolNamingConfig = options.namingConfig || {
    strategy: 'namespace',
    separator: '_',
    format: '{server}{separator}{tool}',
  };

  // Create naming functions
  const generatePublicUri = createNamingFunction(namingConfig);
  const _parsePublicUri = createParsingFunction(namingConfig);

  /**
   * Clear resources for a specific server
   */
  function clearServerResources(serverId: string): void {
    const existingUris = serverResources.get(serverId);
    if (existingUris) {
      for (const uri of existingUris) {
        const resourceList = resources.get(uri);
        if (resourceList) {
          const filtered = resourceList.filter((r) => r.serverId !== serverId);
          if (filtered.length > 0) {
            resources.set(uri, filtered);
          } else {
            resources.delete(uri);
          }
        }
      }
      serverResources.delete(serverId);
    }
  }

  /**
   * Register resources from a server
   */
  function registerServerResources(
    serverId: string,
    newResources: Resource[],
  ): void {
    // Clear existing resources
    clearServerResources(serverId);

    // Register new resources
    const resourceUris = new Set<string>();
    for (const resource of newResources) {
      // Keep original URI, only namespace the name
      const namespacedName = resource.name ? generatePublicUri(serverId, resource.name) : resource.name;
      const metadata: ResourceMetadata = {
        ...resource,
        name: namespacedName,
        uri: resource.uri,  // Keep original URI
        serverId,
        originalUri: resource.uri,
      };

      // URI-based management - use original URI as key
      const existing = resources.get(resource.uri) || [];
      existing.push(metadata);
      resources.set(resource.uri, existing);
      resourceUris.add(resource.uri);
    }

    serverResources.set(serverId, resourceUris);
  }

  /**
   * Resolve a URI to server and original URI
   */
  function resolveResource(uri: string): ResourceResolveResult | null {
    const resourceList = resources.get(uri);
    if (!resourceList || resourceList.length === 0) {
      return null;
    }

    // Return the first resource (in case of collisions)
    const resource = resourceList[0];
    return {
      serverId: resource.serverId,
      originalUri: resource.originalUri,
      publicUri: uri,
    };
  }

  /**
   * Get resources for a specific server
   */
  function getServerResources(serverId: string): Resource[] {
    const uris = serverResources.get(serverId);
    if (!uris) {
      return [];
    }

    const result: Resource[] = [];
    for (const uri of uris) {
      const resourceList = resources.get(uri);
      if (resourceList) {
        const serverResource = resourceList.find(
          (r) => r.serverId === serverId,
        );
        if (serverResource) {
          // Return without serverId and originalUri metadata
          const { serverId: _, originalUri: __, ...resource } = serverResource;
          result.push(resource);
        }
      }
    }

    return result;
  }

  /**
   * Get all resources from all servers
   */
  function getAllResources(): Resource[] {
    const allResources: Resource[] = [];
    const seen = new Set<string>();

    for (const [uri, resourceList] of resources) {
      if (!seen.has(uri) && resourceList.length > 0) {
        seen.add(uri);
        // Return the first resource for each URI (in case of collisions)
        const { serverId: _, originalUri: __, ...resource } = resourceList[0];
        allResources.push(resource);
      }
    }

    return allResources;
  }

  /**
   * Get resource collisions (URIs with multiple servers)
   */
  function getResourceCollisions(): Map<string, string[]> {
    const collisions = new Map<string, string[]>();

    for (const [uri, resourceList] of resources) {
      if (resourceList.length > 1) {
        const serverIds = [...new Set(resourceList.map((r) => r.serverId))];
        if (serverIds.length > 1) {
          collisions.set(uri, serverIds);
        }
      }
    }

    return collisions;
  }

  /**
   * Clear all resources
   */
  function clear(): void {
    resources.clear();
    serverResources.clear();
  }

  // Return the public interface
  return {
    registerServerResources,
    clearServerResources,
    resolveResource,
    getServerResources,
    getAllResources,
    getResourceCollisions,
    getResourceCount: () => resources.size,
    clear,
  };
}
