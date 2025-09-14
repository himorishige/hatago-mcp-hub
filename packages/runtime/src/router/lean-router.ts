/**
 * Lean router - functional routing implementation
 *
 * Following Hatago philosophy: "Don't transform, relay"
 * Simple name resolution without complex routing logic
 */

/**
 * Route result for any MCP entity
 */
export type RouteResult = {
  found: boolean;
  serverId?: string;
  originalName?: string;
  error?: string;
};

/**
 * Parse a public name to extract server ID and original name
 * Simple split by underscore - no complex parsing
 */
export function parsePublicName(publicName: string): RouteResult {
  const firstUnderscore = publicName.indexOf('_');

  if (firstUnderscore === -1) {
    return {
      found: false,
      error: `Invalid public name format: ${publicName}`
    };
  }

  return {
    found: true,
    serverId: publicName.substring(0, firstUnderscore),
    originalName: publicName.substring(firstUnderscore + 1)
  };
}

/**
 * Generate a public name from server ID and original name
 */
export function generatePublicName(serverId: string, originalName: string): string {
  return `${serverId}_${originalName}`;
}

/**
 * Route a tool call
 */
export function routeTool(publicName: string): RouteResult {
  return parsePublicName(publicName);
}

/**
 * Route a resource request
 * Resources use URI format: serverId://path
 */
export function routeResource(publicUri: string): RouteResult {
  const match = publicUri.match(/^([^:]+):\/\/(.+)$/);

  if (!match) {
    return {
      found: false,
      error: `Invalid resource URI format: ${publicUri}`
    };
  }

  return {
    found: true,
    serverId: match[1],
    originalName: match[2]
  };
}

/**
 * Route a prompt request
 */
export function routePrompt(publicName: string): RouteResult {
  return parsePublicName(publicName);
}

/**
 * Create a router pipeline
 */
export function createRouterPipeline() {
  return {
    tool: routeTool,
    resource: routeResource,
    prompt: routePrompt,
    parse: parsePublicName,
    generate: generatePublicName
  };
}

/**
 * Batch route multiple items
 */
export function batchRoute(items: string[], routeFn: (item: string) => RouteResult): RouteResult[] {
  return items.map((item) => routeFn(item));
}

/**
 * Group items by server
 */
export function groupByServer<T extends { serverId?: string }>(items: T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>();

  for (const item of items) {
    const serverId = item.serverId ?? 'unknown';
    const group = groups.get(serverId) ?? [];
    group.push(item);
    groups.set(serverId, group);
  }

  return groups;
}

/**
 * Filter items by server
 */
export function filterByServer<T>(
  items: T[],
  serverId: string,
  getServerId: (item: T) => string | undefined
): T[] {
  return items.filter((item) => getServerId(item) === serverId);
}

/**
 * Create a lean router for compatibility
 */
export function createLeanRouter(): {
  routeTool: (publicName: string) => RouteResult;
  routeResource: (publicUri: string) => RouteResult;
  routePrompt: (publicName: string) => RouteResult;
  parsePublicName: (publicName: string) => RouteResult;
  generatePublicName: (serverId: string, entityName: string) => string;
  batchRouteTool: (names: string[]) => RouteResult[];
  batchRouteResource: (uris: string[]) => RouteResult[];
  batchRoutePrompt: (names: string[]) => RouteResult[];
  groupByServer: <T extends { serverId?: string }>(items: T[]) => Map<string, T[]>;
  filterByServer: <T>(
    items: T[],
    serverId: string,
    getServerId: (item: T) => string | undefined
  ) => T[];
} {
  const pipeline = createRouterPipeline();

  return {
    // Routing functions
    routeTool: (publicName: string) => pipeline.tool(publicName),
    routeResource: (publicUri: string) => pipeline.resource(publicUri),
    routePrompt: (publicName: string) => pipeline.prompt(publicName),

    // Utility functions
    parsePublicName: pipeline.parse,
    generatePublicName: pipeline.generate,

    // Batch operations
    batchRouteTool: (names: string[]) => batchRoute(names, pipeline.tool),
    batchRouteResource: (uris: string[]) => batchRoute(uris, pipeline.resource),
    batchRoutePrompt: (names: string[]) => batchRoute(names, pipeline.prompt),

    // Grouping and filtering
    groupByServer,
    filterByServer
  };
}
