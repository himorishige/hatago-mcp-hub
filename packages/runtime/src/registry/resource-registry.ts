/**
 * Simplified ResourceRegistry - class-based implementation
 * Resources are stored by original URI (not namespaced)
 * First server wins for duplicate URIs
 */

import type { Resource } from '@modelcontextprotocol/sdk/types.js';

/**
 * Resource metadata stored in registry
 */
type ResourceMetadata = Resource & {
  serverId: string;
  originalUri: string;
};

/**
 * Registry for managing resources from multiple servers
 */
export class ResourceRegistry {
  private resources = new Map<string, ResourceMetadata>();
  private serverResources = new Map<string, Set<string>>();

  /**
   * Register resources from a server
   */
  registerServerResources(serverId: string, resources: Resource[]): void {
    // Clear existing resources for this server
    this.clearServerResources(serverId);

    // Track resource URIs for this server
    const resourceUris = new Set<string>();

    for (const resource of resources) {
      // Use original URI as key (not namespaced)
      const uri = resource.uri;

      // Only register if URI not already taken (first server wins)
      if (!this.resources.has(uri)) {
        const metadata: ResourceMetadata = {
          ...resource,
          serverId,
          originalUri: resource.uri
        };

        this.resources.set(uri, metadata);
      }

      resourceUris.add(uri);
    }

    // Track which resources belong to this server
    this.serverResources.set(serverId, resourceUris);
  }

  /**
   * Clear all resources from a server
   */
  clearServerResources(serverId: string): void {
    const resourceUris = this.serverResources.get(serverId);
    if (!resourceUris) {
      return;
    }

    for (const uri of resourceUris) {
      // Only delete if this server owns the resource
      const resource = this.resources.get(uri);
      if (resource && resource.serverId === serverId) {
        this.resources.delete(uri);
      }
    }

    this.serverResources.delete(serverId);
  }

  /**
   * Get all resources
   */
  getAllResources(): Resource[] {
    return Array.from(this.resources.values()).map(
      ({ serverId: _serverId, originalUri: _originalUri, ...resource }) => resource
    );
  }

  /**
   * Get a resource by URI
   */
  getResource(uri: string): ResourceMetadata | undefined {
    return this.resources.get(uri);
  }

  /**
   * Get all resources from a specific server
   */
  getServerResources(serverId: string): Resource[] {
    const resourceUris = this.serverResources.get(serverId);
    if (!resourceUris) return [];

    const result: Resource[] = [];
    for (const uri of resourceUris) {
      const resource = this.resources.get(uri);
      if (resource && resource.serverId === serverId) {
        const { serverId: _serverId, originalUri: _originalUri, ...rest } = resource;
        void _serverId;
        void _originalUri;
        result.push(rest);
      }
    }
    return result;
  }

  /**
   * Clear all resources
   */
  clear(): void {
    this.resources.clear();
    this.serverResources.clear();
  }

  /**
   * Get resource count
   */
  getResourceCount(): number {
    return this.resources.size;
  }

  /**
   * Resolve resource to get server ID and original URI
   */
  resolveResource(uri: string): { serverId: string; originalUri: string } | null {
    const metadata = this.resources.get(uri);
    if (!metadata) {
      return null;
    }

    return {
      serverId: metadata.serverId,
      originalUri: metadata.originalUri
    };
  }
}

/**
 * Create a new resource registry instance
 */
export function createResourceRegistry(): ResourceRegistry {
  return new ResourceRegistry();
}