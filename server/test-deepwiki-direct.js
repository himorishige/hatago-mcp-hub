import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';

const client = new Client({
  name: 'test-client',
  version: '1.0.0',
}, {
  capabilities: {},
});

const transport = new SSEClientTransport(
  new URL('https://mcp.deepwiki.com/sse')
);

await client.connect(transport);

const tools = await client.listTools();
console.log(JSON.stringify(tools, null, 2));

await client.close();
