import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { json, REPO_DIR, startMcp } from './helpers.js';

/*
  Prints example tool calls and answers on a small synthetic inventory, for the feature document:

    node mcp/test/examples.mjs

  It starts a temporary Atlas and the adapter, exactly as the integration test does; nothing touches
  data/ and the token exists only for the run.
*/
process.chdir(REPO_DIR);
const { startServer, stopServer } = await import('../../test/serverProcess.js');
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'atlas-mcp-examples-'));
const atlas = await startServer(dataDir);
const request = async (url, options) => (await atlas.fetch(`${atlas.base}${url}`, options)).json();
let mcp;
try {
  const category = await request('/api/categories', json('POST', { name: 'Photo gear' }));
  const brand = await request(`/api/categories/${category.id}/fields`, json('POST', { name: 'Brand', type: 'text' }));
  const bag = await request('/api/items', json('POST', { name: 'Camera bag', category_id: category.id, location: 'Hall closet', location_detail: 'Top shelf' }));
  const camera = await request('/api/items', json('POST', { name: 'Film camera', category_id: category.id, condition_grade: 'good', parent_item_id: bag.id, field_values: { [brand.id]: 'Zenit' } }));
  const { token } = await request('/api/security/tokens', json('POST', { name: 'MCP examples', scopes: ['inventory:read'] }));
  mcp = startMcp({ ATLAS_BASE_URL: atlas.base, ATLAS_API_TOKEN: token });
  const client = new Client({ name: 'examples', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${await mcp.ready}/mcp`));
  await client.connect(transport);
  for (const [name, args] of [['search_items', { query: 'camera', page_size: 5 }], ['get_item_location', { item: camera.uuid }],
    ['get_item_history', { item: camera.id, limit: 2 }], ['list_categories', { category_id: category.id }], ['get_item', { item: 999 }]]) {
    const result = await client.callTool({ name, arguments: args });
    console.log(`\n### ${name} ${JSON.stringify(args)}\n${JSON.stringify(result.structuredContent, null, 2)}`);
  }
  await transport.terminateSession();
  await client.close();
} finally {
  await mcp?.stop();
  await stopServer(atlas.child);
  await rm(dataDir, { recursive: true, force: true });
}
