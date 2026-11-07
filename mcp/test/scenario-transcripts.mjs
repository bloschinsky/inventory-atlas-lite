import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { REPO_DIR, startMcp } from './helpers.js';
import { seedScenarioInventory } from './scenarioFixture.js';

/*
  Prints sample interactions on the synthetic inventory of the acceptance suite, for
  docs/features/mcp-client-integration.md:

    node mcp/test/scenario-transcripts.mjs

  Each entry is a user prompt, the tool calls a connector makes for it, and the adapter's answers.
  It starts a temporary Atlas and the adapter; nothing touches data/, and the token exists only for
  the run. The answers are real; the prompts are the scenarios of issue #67.
*/
process.chdir(REPO_DIR);
const { startServer, stopServer } = await import('../../test/serverProcess.js');
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'atlas-mcp-transcripts-'));
const atlas = await startServer(dataDir);
const request = async (url, options) => (await atlas.fetch(`${atlas.base}${url}`, options)).json();
let mcp;
try {
  const { items } = await seedScenarioInventory(request);
  const { token } = await request('/api/security/tokens', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'MCP transcripts', scopes: ['inventory:read'] }) });
  mcp = startMcp({ ATLAS_BASE_URL: atlas.base, ATLAS_API_TOKEN: token });
  const client = new Client({ name: 'transcripts', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${await mcp.ready}/mcp`));
  await client.connect(transport);
  const scenarios = [
    ['Where is my FM2?', [['search_items', { query: 'FM2' }]]],
    ['Where is the Nikon FM2 stored?', [['get_item_location', { item: items.fm2.uuid }]]],
    ['When did the Speedlight flash come back?', [['get_item_history', { item: items.flash.id, type: 'transfer' }]]],
    ['Where is my Hasselblad?', [['search_items', { query: 'Hasselblad' }]]],
    ['Delete the lens cleaning kit.', [['delete_item', { item: items.kit.id }]]]
  ];
  for (const [prompt, calls] of scenarios) {
    console.log(`\n### "${prompt}"`);
    for (const [name, args] of calls) {
      const result = await client.callTool({ name, arguments: args });
      console.log(`\n${name} ${JSON.stringify(args)}\n${JSON.stringify(result.structuredContent ?? result.content, null, 2)}`);
    }
  }
  await transport.terminateSession();
  await client.close();
} finally {
  await mcp?.stop();
  await stopServer(atlas.child);
  await rm(dataDir, { recursive: true, force: true });
}
