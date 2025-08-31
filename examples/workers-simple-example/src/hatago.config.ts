/**
 * Hatago MCP Hub Configuration
 *
 * Configure your remote MCP servers here.
 * Note: Cloudflare Workers cannot run local processes,
 * so only remote HTTP-based MCP servers are supported.
 */

export const hatagoConfig = {
  mcpServers: {
    // DeepWiki - Search and analyze GitHub repository documentation
    deepwiki: {
      type: 'remote' as const,
      url: 'https://mcp.deepwiki.com/mcp',
      transport: 'streamable-http' as const
    }

    // Add more remote MCP servers here
    // Example:
    // another_server: {
    //   type: 'remote' as const,
    //   url: 'https://example.com/mcp',
    //   transport: 'streamable-http' as const,
    // }
  }
} as const;

// Type export for type safety
export type HatagoConfig = typeof hatagoConfig;
