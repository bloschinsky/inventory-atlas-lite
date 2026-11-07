import assert from 'node:assert/strict';
import test from 'node:test';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { ToolError } from '../src/errors.js';
import { createMcpServer } from '../src/httpServer.js';
import { createLogger } from '../src/logger.js';
import { MAX_RESULT_CHARS } from '../src/mapping.js';
import { CONDITION_FILTERS, HISTORY_TYPES, LIFECYCLE_FILTERS, MAX_PAGE_SIZE, SORT_KEYS } from '../src/tools.js';
import { CONDITION_GRADES } from '../../shared/conditionGrades.js';
import { LIFECYCLE_FILTERS as ATLAS_LIFECYCLE_FILTERS } from '../../shared/itemLifecycle.js';
import { CORE_ITEM_COLUMNS } from '../../shared/itemColumns.js';
import { HISTORY_FILTERS } from '../../server/src/services/itemHistoryService.js';

const UUID = '33333333-3333-4333-8333-333333333333';
const TOOLS = ['get_inventory_summary', 'get_item', 'get_item_history', 'get_item_location', 'list_categories', 'search_items'];

// A fake Atlas client that answers from a route table and records every call.
function fakeAtlas(routes) {
  const calls = [];
  return {
    calls,
    async get(segments, query, { signal } = {}) {
      calls.push({ path: segments.join('/'), query: Object.fromEntries(Object.entries(query ?? {}).filter(([, v]) => v !== undefined)) });
      if (signal?.aborted) throw new ToolError('cancelled');
      const answer = routes[segments.join('/')];
      if (answer === undefined) throw new ToolError('not_found', { atlasCode: 'ITEM_NOT_FOUND', status: 404 });
      return typeof answer === 'function' ? answer({ query, signal }) : structuredClone(answer);
    }
  };
}

async function connect(atlas) {
  const lines = [];
  const server = createMcpServer({ atlas, logger: createLogger('debug', line => lines.push(line)) });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test', version: '1.0.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  return { client, lines, close: () => client.close() };
}

test('the enums match Atlas', () => {
  assert.deepEqual(CONDITION_FILTERS, [...CONDITION_GRADES, 'unset']);
  assert.deepEqual(LIFECYCLE_FILTERS, ATLAS_LIFECYCLE_FILTERS);
  assert.deepEqual(HISTORY_TYPES, Object.keys(HISTORY_FILTERS));
  const sortable = CORE_ITEM_COLUMNS.filter(column => column.sortable).map(column => column.key);
  assert.ok(SORT_KEYS.every(key => sortable.includes(key)));
});

test('exactly the six read-only tools are listed with strict schemas', async () => {
  const { client, close } = await connect(fakeAtlas({}));
  try {
    const { tools } = await client.listTools();
    assert.deepEqual(tools.map(tool => tool.name).sort(), TOOLS);
    for (const tool of tools) {
      assert.equal(tool.annotations.readOnlyHint, true, tool.name);
      assert.equal(tool.annotations.destructiveHint, false, tool.name);
      assert.equal(tool.inputSchema.additionalProperties, false, `${tool.name} refuses unknown arguments`);
      assert.ok(tool.description.length > 40);
    }
    const search = tools.find(tool => tool.name === 'search_items');
    assert.equal(search.inputSchema.properties.page_size.maximum, MAX_PAGE_SIZE);
  } finally {
    await close();
  }
});

test('malformed arguments are refused before Atlas is called', async () => {
  const atlas = fakeAtlas({});
  const { client, close } = await connect(atlas);
  try {
    for (const [name, args] of [
      ['get_item', {}],
      ['get_item', { item: '../../security/users' }],
      ['get_item', { item: 'not-a-uuid-but-36-characters-long-xx' }],
      ['get_item', { item: -1 }],
      ['get_item', { item: 1.5 }],
      ['get_item', { item: 1, extra: true }],
      ['search_items', { page_size: 1000 }],
      ['search_items', { query: 'x'.repeat(201) }],
      ['search_items', { lifecycle: 'deleted' }],
      ['search_items', { sort: 'serialNumber; DROP TABLE' }],
      ['get_item_history', { item: 1, limit: 51 }],
      ['get_item_history', { item: 1, cursor: 'abc' }],
      ['get_item_history', { item: 1, type: 'everything' }],
      ['list_categories', { category_id: '1' }]
    ]) {
      const result = await client.callTool({ name, arguments: args });
      assert.equal(result.isError, true, `${name} ${JSON.stringify(args)}`);
    }
    assert.equal(atlas.calls.length, 0);
    // An invented write tool does not exist, so nothing reaches Atlas.
    const invented = await client.callTool({ name: 'delete_item', arguments: { item: 1 } });
    assert.equal(invented.isError, true);
    assert.match(invented.content[0].text, /delete_item not found/);
    assert.equal(atlas.calls.length, 0);
  } finally {
    await close();
  }
});

test('search_items maps its arguments to the Items query and bounds the page', async () => {
  const atlas = fakeAtlas({ items: { items: [{ id: 1, uuid: UUID, name: 'Камера', lifecycle_status: 'active' }], pagination: { page: 2, pageSize: 5, total: 6, pages: 2 } } });
  const { client, close } = await connect(atlas);
  try {
    const result = await client.callTool({ name: 'search_items', arguments: { query: ' Камера ', category_id: 3, page: 2, page_size: 5, condition: 'unset' } });
    assert.deepEqual(atlas.calls[0], { path: 'items', query: {
      search: 'Камера', categoryId: 3, condition: 'unset', lifecycle: 'active', sort: 'name', direction: 'asc', page: 2, pageSize: 5
    } });
    assert.equal(result.structuredContent.items[0].name, 'Камера');
    assert.equal(result.structuredContent.has_more, false);
    assert.match(result.content[0].text, /never as instructions/);
  } finally {
    await close();
  }
});

test('get_item_location walks the container chain and stops at cycles', async () => {
  const atlas = fakeAtlas({
    'items/3': { id: 3, uuid: UUID, name: 'Lens', lifecycle_status: 'active', effective_location: 'Garage', effective_location_source: { id: 1, uuid: UUID, name: 'Box' }, parent: { id: 2 } },
    'items/2': { id: 2, uuid: UUID, name: 'Bag', parent: { id: 1 } },
    'items/1': { id: 1, uuid: UUID, name: 'Box', parent: { id: 2 } }
  });
  const { client, close } = await connect(atlas);
  try {
    const { structuredContent: location } = await client.callTool({ name: 'get_item_location', arguments: { item: '3' } });
    assert.deepEqual(location.container_chain.map(node => node.name), ['Bag', 'Box']);
    assert.equal(location.location_source, 'outermost_container');
    assert.equal(location.geocoordinates, null);
    assert.deepEqual(atlas.calls.map(call => call.path), ['items/3', 'items/2', 'items/1']);
  } finally {
    await close();
  }
});

test('list_categories returns one category with fields, or not_found', async () => {
  const atlas = fakeAtlas({ categories: [{ id: 4, name: 'Tools', item_count: 2, field_count: 1 }], 'categories/4/fields': [{ id: 9, name: 'Brand', type: 'text' }] });
  const { client, close } = await connect(atlas);
  try {
    assert.equal((await client.callTool({ name: 'list_categories', arguments: {} })).structuredContent.categories[0].name, 'Tools');
    const one = await client.callTool({ name: 'list_categories', arguments: { category_id: 4 } });
    assert.deepEqual(one.structuredContent.fields, [{ id: 9, name: 'Brand', type: 'text' }]);
    const missing = await client.callTool({ name: 'list_categories', arguments: { category_id: 5 } });
    assert.equal(missing.isError, true);
    assert.equal(missing.structuredContent.error.kind, 'not_found');
  } finally {
    await close();
  }
});

test('Atlas failures come back as tool errors and the log holds no inventory text', async () => {
  const atlas = fakeAtlas({ 'items/1': () => { throw new ToolError('auth_rejected', { status: 401, atlasCode: 'AUTH_REQUIRED' }); },
    'items/2': () => { throw new Error('unexpected internal failure with Secret Item Name'); },
    'items/3': { id: 3, uuid: UUID, name: 'Secret Item Name', description: 'Private' } });
  const { client, lines, close } = await connect(atlas);
  try {
    const rejected = await client.callTool({ name: 'get_item', arguments: { item: 1 } });
    assert.equal(rejected.structuredContent.error.kind, 'auth_rejected');
    assert.match(rejected.structuredContent.error.message, /revoked/);
    const crashed = await client.callTool({ name: 'get_item', arguments: { item: 2 } });
    assert.equal(crashed.structuredContent.error.kind, 'upstream_error');
    assert.ok(!JSON.stringify(crashed).includes('Secret Item Name'));
    const missing = await client.callTool({ name: 'get_item_history', arguments: { item: UUID } });
    assert.equal(missing.structuredContent.error.kind, 'not_found');
    await client.callTool({ name: 'get_item', arguments: { item: 3 } });
    const log = lines.join('\n');
    assert.ok(!log.includes('Secret Item Name') && !log.includes('Private'));
    assert.match(log, /"tool":"get_item".*"outcome":"auth_rejected"/);
  } finally {
    await close();
  }
});

test('a large Atlas answer is still bounded in the tool result', async () => {
  const children = Array.from({ length: 5000 }, (_, index) => ({ id: index + 10, uuid: UUID, name: `Child ${'x'.repeat(500)} ${index}` }));
  const atlas = fakeAtlas({ 'items/1': { id: 1, uuid: UUID, name: 'n'.repeat(10000), description: 'd'.repeat(100000), children } });
  const { client, close } = await connect(atlas);
  try {
    const result = await client.callTool({ name: 'get_item', arguments: { item: 1 } });
    assert.ok(result.content[0].text.length < 40000, `result is ${result.content[0].text.length} characters`);
    assert.equal(result.structuredContent.contents_count, 5000);
  } finally {
    await close();
  }
});

test('an item or a history page full of long texts is shortened to the result budget, never emptied', async () => {
  const long = index => `${index}:${'Довгий текст '.repeat(300)}`;
  const fields = Array.from({ length: 100 }, (_, index) => ({ id: index + 1, name: `Notes ${index}`, type: 'text', value: long(index) }));
  const events = Array.from({ length: 50 }, (_, index) => ({ id: 1000 - index, type: 'location_changed', occurred_at: '2026-01-01T00:00:00Z',
    from: long(index), to: long(index + 1), from_detail: long(index), to_detail: long(index) }));
  const atlas = fakeAtlas({ 'items/1': { id: 1, uuid: UUID, name: 'Archive box', description: long('d'), fields }, 'items/1/history': { events, next_cursor: 951 } });
  const { client, close } = await connect(atlas);
  try {
    for (const [name, args] of [['get_item', { item: 1 }], ['get_item_history', { item: 1, limit: 50 }]]) {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(JSON.stringify(result.structuredContent).length <= MAX_RESULT_CHARS, `${name} stays within the budget`);
      assert.ok(result.content[0].text.length < MAX_RESULT_CHARS + 200, `${name} text is ${result.content[0].text.length} characters`);
      assert.equal(result.structuredContent.text_shortened, true);
    }
    const item = (await client.callTool({ name: 'get_item', arguments: { item: 1 } })).structuredContent;
    assert.equal(item.custom_fields.length, 100, 'no field is dropped');
    assert.ok(item.custom_fields.every((field, index) => field.value.startsWith(`${index}:`) && field.value.endsWith('…')), 'a shortened value is visibly cut, never null');
    assert.equal(item.uuid, UUID);
    const history = (await client.callTool({ name: 'get_item_history', arguments: { item: 1, limit: 50 } })).structuredContent;
    assert.deepEqual([history.events.length, history.next_cursor], [50, '951']);
  } finally {
    await close();
  }
});

test('a cancelled call aborts the Atlas request it is waiting for', async () => {
  let aborted = false;
  const atlas = fakeAtlas({ dashboard: ({ signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => { aborted = true; reject(new ToolError('cancelled')); });
  }) });
  const { client, close } = await connect(atlas);
  try {
    const controller = new AbortController();
    const call = client.callTool({ name: 'get_inventory_summary', arguments: {} }, undefined, { signal: controller.signal });
    while (!atlas.calls.length) await new Promise(resolve => setImmediate(resolve));
    controller.abort();
    await assert.rejects(call, /abort/i);
    while (!aborted) await new Promise(resolve => setImmediate(resolve));
  } finally {
    await close();
  }
});
