/*
  Runs inside a throwaway container of the adapter image on the private network (fed through stdin by
  docker-smoke.mjs, so it resolves the image's own SDK): waits for readiness, then lists the tools and
  makes read calls over Streamable HTTP. It prints one JSON line with what it saw.
*/
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const endpoint = process.argv[2];
const deadline = Date.now() + 60000;
for (;;) {
  const status = await fetch(`${endpoint}/readyz`).then(response => response.status, () => 0);
  if (status === 200) break;
  if (Date.now() > deadline) throw new Error(`The adapter did not become ready (last status ${status}).`);
  await new Promise(resolve => setTimeout(resolve, 500));
}
const client = new Client({ name: 'atlas-mcp-docker-smoke', version: '1.0.0' });
const transport = new StreamableHTTPClientTransport(new URL(`${endpoint}/mcp`));
await client.connect(transport);
const { tools } = await client.listTools();
const search = await client.callTool({ name: 'search_items', arguments: { query: 'Docker MCP smoke' } });
const summary = await client.callTool({ name: 'get_inventory_summary', arguments: {} });
await transport.terminateSession();
await client.close();
process.stdout.write(`${JSON.stringify({
  tools: tools.map(tool => tool.name).sort(),
  found: search.structuredContent?.items?.map(item => item.name) ?? [],
  activeItems: summary.structuredContent?.active_items ?? null
})}\n`);
