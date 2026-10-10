import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import Database from 'better-sqlite3';
import sharp from 'sharp';
import { startServer, stopServer } from './serverProcess.js';

/*
  Smart URL import, Phase 1: product extraction from local deterministic HTML fixtures, attribute
  matching, the Source URL field, and the network protections of the page fetcher. Nothing here
  reaches the internet: host names are pointed at a local test server through the fetcher's
  injectable resolver, and only that server's loopback address is allowed in those tests.
*/
const dataDir = await mkdtemp(path.join(os.tmpdir(), 'inventory-url-import-test-'));
process.env.DATA_DIR = dataDir;

const { applySchema, SCHEMA_VERSION } = await import('../server/src/db.js');
const { validateStagedDatabase } = await import('../server/src/restore/databaseFile.js');
const { CategoryRepository } = await import('../server/src/repositories/categoryRepository.js');
const { CustomFieldRepository } = await import('../server/src/repositories/customFieldRepository.js');
const { ItemHistoryRepository } = await import('../server/src/repositories/itemHistoryRepository.js');
const { ItemPhotoRepository } = await import('../server/src/repositories/itemPhotoRepository.js');
const { ItemRepository } = await import('../server/src/repositories/itemRepository.js');
const { CategoryService } = await import('../server/src/services/categoryService.js');
const { CustomFieldService } = await import('../server/src/services/customFieldService.js');
const { ItemHistoryService } = await import('../server/src/services/itemHistoryService.js');
const { ItemService } = await import('../server/src/services/itemService.js');
const { UrlImportService } = await import('../server/src/services/urlImportService.js');
const { PublicWebClient } = await import('../server/src/integrations/publicWebClient.js');
const { isPublicAddress, readPublicUrl } = await import('../server/src/integrations/publicAddress.js');
const { extractProduct, readAmount } = await import('../server/src/urlImport/productExtraction.js');
const { plainText } = await import('../server/src/urlImport/htmlDocument.js');
const { matchCustomFields, productAttributes } = await import('../shared/productImport.js');
const { parseItemImportDocument, reviewItemDraft } = await import('../shared/itemImport.js');

const fixture = name => fs.readFileSync(path.join(import.meta.dirname, 'fixtures/url-import', `${name}.html`), 'utf8');
const extract = (name, url = 'https://shop.test/p/item') => extractProduct(fixture(name), url);
const codes = warnings => warnings.map(warning => warning.code);

const refused = async (work, status, code) => assert.rejects(work, error => {
  assert.equal(error.code, code, `expected ${code}, received ${error.code}: ${error.message}`);
  assert.equal(error.status, status);
  return true;
});

// ---------------------------------------------------------------------------------------------
// Extraction from static HTML
// ---------------------------------------------------------------------------------------------

test('JSON-LD Product gives the name, plain-text description, identifiers, attributes, prices, and images', () => {
  const result = extract('json-ld-product', 'https://shop.test/p/x200?ref=1#top');
  assert.equal(result.product.name, 'Trail Camera X200');
  // Markup, the script and its content are gone; entities are decoded once.
  assert.equal(result.product.description, 'Weatherproof trail camera with night vision & 4K video.');
  assert.deepEqual(
    { brand: result.product.brand, model: result.product.model, sku: result.product.sku, mpn: result.product.mpn, gtin: result.product.gtin },
    { brand: 'Fieldmark', model: 'X200', sku: 'FM-X200-BLK', mpn: 'X200-01', gtin: '4006381333931' }
  );
  assert.equal(result.provenance.name, 'json-ld');
  assert.deepEqual(result.product.categories, ['Outdoor', 'Cameras']);
  assert.deepEqual(result.product.attributes.map(attribute => [attribute.name, attribute.value]), [
    ['Color', 'Black'], ['Weight', '320 g'], ['Waterproof', 'Yes'], ['Battery life', '6 months']
  ]);
  // The strikethrough price is the regular price; the offer price is then the sale price.
  assert.deepEqual(result.price, {
    candidates: [
      { amount: '159.00', currency: 'EUR', kind: 'regular', source: 'json-ld' },
      { amount: '129.90', currency: 'EUR', kind: 'sale', source: 'json-ld' }
    ],
    ambiguous: false
  });
  // Relative images resolve against the page; a data: URL is never a candidate.
  assert.deepEqual(result.images.map(image => image.url), [
    'https://shop.test/images/x200-front.jpg', 'https://cdn.shop.test/images/x200-side.png', 'https://cdn.shop.test/og/x200.jpg'
  ]);
  assert.equal(result.canonicalUrl, 'https://shop.test/products/trail-camera-x200');
  assert.deepEqual(result.warnings, []);
});

test('an @graph ProductGroup resolves @id references and leaves variant prices for the user', () => {
  const result = extract('graph-product-group');
  assert.equal(result.product.name, 'Merino Hiking Socks');
  assert.equal(result.product.brand, 'Woolpath');
  assert.deepEqual(result.product.categories, ['Clothing', 'Socks']);
  assert.deepEqual(result.price.candidates.map(price => [price.amount, price.currency]), [['18.00', 'USD'], ['21.50', 'USD']]);
  assert.equal(result.price.ambiguous, true);
  assert.deepEqual(codes(result.warnings), ['URL_IMPORT_WARNING_PRICE_AMBIGUOUS']);
  assert.equal(result.images.length, 2);
});

test('Open Graph and product meta tags are the fallback when JSON-LD is malformed', () => {
  const result = extract('open-graph');
  assert.equal(result.product.name, 'Folding Camp Lantern');
  assert.equal(result.provenance.name, 'open-graph');
  assert.equal(result.product.description, 'A collapsible LED lantern & power bank.');
  assert.equal(result.product.brand, 'Brightfold');
  // "1 299,00" with a lower-case currency code is one clear reading.
  assert.deepEqual(result.price, { candidates: [{ amount: '1299.00', currency: 'UAH', kind: 'offer', source: 'open-graph' }], ambiguous: false });
  // A protocol-relative image is resolved; a javascript: URL is dropped.
  assert.deepEqual(result.images.map(image => image.url), ['https://images.camp.test/lantern.jpg']);
  assert.equal(result.canonicalUrl, 'https://camp.test/lantern');
  assert.deepEqual(codes(result.warnings), ['URL_IMPORT_WARNING_INVALID_JSON_LD']);
});

test('a specification table and definition list give attributes from two-cell rows only', () => {
  const result = extract('spec-table');
  assert.equal(result.product.name, 'Cordless Drill CD-18');
  assert.equal(result.provenance.name, 'html');
  assert.deepEqual(result.product.attributes.map(attribute => [attribute.name, attribute.value, attribute.source]), [
    ['Brand', 'Torqline', 'html'], ['Weight', '1.4', 'html'], ['Colour', 'Orange', 'html'], ['Release date', '2023-04-01', 'html'],
    ['Cordless', 'Yes', 'html'], ['Chuck size', '13 mm', 'html'], ['Warranty', '3 years', 'html']
  ]);
  assert.deepEqual(result.price.candidates, []);
  assert.deepEqual(result.warnings, []);
});

test('a page without product data keeps only its title and says so; nothing absent is invented', () => {
  const result = extract('title-only');
  assert.equal(result.product.name, 'Loading… | Single Page Shop');
  assert.deepEqual({ ...result.product, name: '' }, {
    name: '', brand: '', model: '', description: '', sku: '', mpn: '', gtin: '', categories: [], attributes: []
  });
  assert.deepEqual(result.price.candidates, []);
  assert.deepEqual(codes(result.warnings), ['URL_IMPORT_WARNING_NO_PRODUCT_DATA']);
});

test('invalid amounts and currencies are ignored with a warning, and mixed currencies or ranges are ambiguous', () => {
  const result = extract('prices');
  assert.deepEqual(result.price.candidates.map(price => [price.amount, price.currency, price.kind]), [
    ['49.99', 'EUR', 'offer'], ['1899.00', 'UAH', 'offer'], ['45.00', 'EUR', 'low'], ['55.00', 'EUR', 'high']
  ]);
  assert.equal(result.price.ambiguous, true);
  assert.deepEqual(codes(result.warnings), ['URL_IMPORT_WARNING_PRICE_INVALID', 'URL_IMPORT_WARNING_PRICE_AMBIGUOUS']);
});

test('amounts are read only where their reading is unambiguous', () => {
  const cases = [
    [129.9, '129.90'], ['1299', '1299.00'], ['1,299.50', '1299.50'], ['1.299,50', '1299.50'], ['19,99', '19.99'], ['0.5000', '0.50'],
    ['12.34567', null], ['0', null], ['-5', null], ['free', null], ['$10', null], ['1e3', null], [Number.NaN, null], [null, null]
  ];
  for (const [raw, expected] of cases) assert.equal(readAmount(raw), expected, String(raw));
});

test('hostile markup never survives as markup, and unsafe image addresses are dropped', () => {
  const result = extract('hostile');
  assert.equal(result.product.name, 'Hostile Gadget Pro');
  assert.equal(result.product.description, 'Nice gadget');
  assert.deepEqual(result.product.attributes, [{ name: 'Model', value: 'HG-1', source: 'html' }]);
  // data:, file:, and credentials are refused; only the relative public image remains.
  assert.deepEqual(result.images.map(image => image.url), ['https://shop.test/ok.png']);
  for (const value of [result.product.name, result.product.description, ...result.product.attributes.map(attribute => attribute.value)]) {
    assert.doesNotMatch(value, /[<>]/);
  }
  assert.equal(plainText('&lt;img src=x onerror=alert(1)&gt;Text&#0;&#xD800;'), 'Text��');
});

test('extraction stays fast on runaway markup', () => {
  const runaway = `<html><head><title>T</title></head><body>${'<table<td<dl<dt'.repeat(150_000)}${'<script>'.repeat(10_000)}`;
  const started = Date.now();
  const result = extractProduct(runaway, 'https://shop.test/');
  assert.equal(result.product.name, 'T');
  assert.ok(Date.now() - started < 2000, `extraction took ${Date.now() - started} ms`);
  const deep = `<script type="application/ld+json">${'['.repeat(100_000)}</script><title>Deep</title>`;
  assert.deepEqual(codes(extractProduct(deep, 'https://shop.test/').warnings), ['URL_IMPORT_WARNING_INVALID_JSON_LD', 'URL_IMPORT_WARNING_NO_PRODUCT_DATA']);
});

// ---------------------------------------------------------------------------------------------
// Matching found attributes to existing custom fields
// ---------------------------------------------------------------------------------------------

test('attributes match existing fields by name or alias and only with a value valid for the field type', () => {
  const { product, provenance } = extract('json-ld-product');
  const fields = [
    { id: 1, name: 'Manufacturer', type: 'text' }, { id: 2, name: 'Waterproof', type: 'boolean' }, { id: 3, name: 'Colour', type: 'color' },
    { id: 4, name: 'Weight', type: 'number' }, { id: 5, name: 'EAN', type: 'text' }, { id: 6, name: 'Purchased', type: 'date' },
    { id: 7, name: 'Serial', type: 'text' }
  ];
  const { matches, ambiguous } = matchCustomFields(productAttributes(product, provenance), fields);
  assert.deepEqual(matches.map(match => [match.fieldId, match.value, match.attribute]), [
    [1, 'Fieldmark', 'Brand'], [2, '1', 'Waterproof'], [3, '{"key":"black","hex":"#171717"}', 'Color'], [5, '4006381333931', 'GTIN']
  ]);
  // "320 g" is not a plain number, nothing names a date or a serial number: those fields stay unmatched.
  assert.deepEqual(ambiguous, []);

  const spec = extract('spec-table');
  const specMatches = matchCustomFields(productAttributes(spec.product, spec.provenance), [
    { id: 1, name: 'Weight', type: 'number' }, { id: 2, name: 'Color', type: 'color' }, { id: 3, name: 'Release date', type: 'date' },
    { id: 4, name: 'Cordless', type: 'boolean' }
  ]).matches;
  assert.deepEqual(specMatches.map(match => [match.fieldId, match.value]), [
    [1, '1.4'], [2, '{"key":"orange","hex":"#F07830"}'], [3, '2023-04-01'], [4, '1']
  ]);
});

test('different values competing for one field leave it unmatched', () => {
  const attributes = [{ name: 'Brand', value: 'One' }, { name: 'Manufacturer', value: 'Two' }, { name: 'Colour', value: '#a08c75' }];
  const result = matchCustomFields(attributes, [{ id: 1, name: 'Brand', type: 'text' }, { id: 2, name: 'Color', type: 'color' }]);
  assert.deepEqual(result.ambiguous, ['Brand']);
  assert.deepEqual(result.matches.map(match => match.value), ['{"key":"custom","hex":"#A08C75"}']);
});

// ---------------------------------------------------------------------------------------------
// Address policy
// ---------------------------------------------------------------------------------------------

test('only public unicast addresses are allowed', () => {
  for (const address of ['127.0.0.1', '10.1.2.3', '172.16.5.4', '192.168.1.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '224.0.0.1',
    '255.255.255.255', '198.18.0.1', '192.0.2.10', '::', '::1', 'fe80::1', 'fd00:ec2::254', 'fc00::1', 'ff02::1', '::ffff:127.0.0.1',
    '::ffff:10.0.0.1', '::127.0.0.1', '64:ff9b::a00:1', '2002:7f00:1::1', '2001:0:4136:e378:8000:63bf:3fff:fdd2', '2001:db8::1', 'not-an-ip']) {
    assert.equal(isPublicAddress(address), false, address);
  }
  for (const address of ['93.184.215.14', '8.8.8.8', '1.1.1.1', '2606:4700::6810:84e5', '2a00:1450:4001:82a::200e']) {
    assert.equal(isPublicAddress(address), true, address);
  }
});

test('page addresses must be public http(s) URLs without credentials, whatever their spelling', () => {
  const blocked = ['http://127.0.0.1/', 'http://0x7f.1/', 'http://2130706433/', 'http://0177.0.0.1/', 'http://127.1/', 'http://[::1]/',
    'http://[::ffff:7f00:1]/', 'http://[::ffff:127.0.0.1]/', 'http://localhost:3000/', 'http://LOCALHOST./', 'http://api.localhost/',
    'http://printer.local/', 'http://nas.lan/', 'http://metadata.google.internal/', 'http://169.254.169.254/latest/meta-data/',
    'http://intranet/', 'http://192.168.1.10:8006/'];
  for (const url of blocked) assert.throws(() => readPublicUrl(url), { code: 'URL_IMPORT_BLOCKED_HOST' }, url);
  for (const url of ['file:///etc/passwd', 'ftp://shop.test/x', 'data:text/html,hi', 'javascript:alert(1)', 'gopher://shop.test/']) {
    assert.throws(() => readPublicUrl(url), { code: 'URL_IMPORT_UNSUPPORTED_PROTOCOL' }, url);
  }
  assert.throws(() => readPublicUrl('https://user:pass@shop.test/'), { code: 'URL_IMPORT_URL_CREDENTIALS' });
  assert.throws(() => readPublicUrl('not a url'), { code: 'URL_IMPORT_INVALID_URL' });
  assert.throws(() => readPublicUrl(`https://shop.test/${'a'.repeat(2100)}`), { code: 'URL_IMPORT_INVALID_URL' });
  assert.throws(() => readPublicUrl('  '), { code: 'URL_IMPORT_URL_REQUIRED' });
  assert.equal(readPublicUrl(' https://Shop.Example/p/1?x=1#reviews ').href, 'https://shop.example/p/1?x=1');
});

// ---------------------------------------------------------------------------------------------
// The page fetcher against a local server
// ---------------------------------------------------------------------------------------------

const pngBytes = await sharp({ create: { width: 4, height: 3, channels: 3, background: '#2878d0' } }).png().toBuffer();
const received = [];

const site = http.createServer((req, res) => {
  received.push({ url: req.url, headers: req.headers });
  const port = site.address().port;
  const html = body => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(body);
  };
  switch (req.url) {
    case '/product': {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Encoding': 'gzip' });
      // The fixture's CDN images are served by this same test server.
      return res.end(zlib.gzipSync(fixture('json-ld-product').replaceAll('https://cdn.shop.test', `http://cdn.shop.test:${port}`)));
    }
    case '/brotli':
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'br' });
      return res.end(zlib.brotliCompressSync(fixture('open-graph')));
    case '/windows-1251':
      res.writeHead(200, { 'Content-Type': 'text/html' });
      return res.end(Buffer.concat([Buffer.from('<meta charset="windows-1251"><title>'), Buffer.from([0xcb, 0xe0, 0xec, 0xef, 0xe0]), Buffer.from('</title>')]));
    case '/empty': return html('<html><body></body></html>');
    case '/redirect-private': res.writeHead(302, { Location: `http://private.test:${port}/product` }); return res.end();
    case '/redirect-literal': res.writeHead(301, { Location: 'http://10.0.0.1/' }); return res.end();
    case '/redirect-localhost': res.writeHead(307, { Location: `http://localhost:${port}/product` }); return res.end();
    case '/redirect-metadata': res.writeHead(302, { Location: 'http://169.254.169.254/latest/meta-data/' }); return res.end();
    case '/redirect-file': res.writeHead(302, { Location: 'file:///etc/passwd' }); return res.end();
    case '/redirect-same': res.writeHead(302, { Location: '/product' }); return res.end();
    case '/loop': res.writeHead(302, { Location: '/loop' }); return res.end();
    case '/big': return html(`<title>Big</title>${'x'.repeat(4 * 1024 * 1024)}`);
    case '/bomb':
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      return res.end(zlib.gzipSync(Buffer.alloc(64 * 1024 * 1024, 0x20)));
    case '/declared-large':
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Length': String(512 * 1024 * 1024) });
      return res.end();
    case '/corrupt-gzip':
      res.writeHead(200, { 'Content-Type': 'text/html', 'Content-Encoding': 'gzip' });
      return res.end('this is not gzip');
    case '/binary': res.writeHead(200, { 'Content-Type': 'application/octet-stream' }); return res.end(Buffer.alloc(10));
    case '/forbidden': res.writeHead(403, { 'Content-Type': 'text/html' }); return res.end('Login required');
    case '/missing': res.writeHead(404, { 'Content-Type': 'text/html' }); return res.end('Not found');
    case '/hang': return undefined;
    case '/images/x200-front.jpg': res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end(pngBytes);
    case '/images/x200-side.png': res.writeHead(200, { 'Content-Type': 'image/png' }); return res.end('<svg onload=alert(1)></svg>');
    case '/og/x200.jpg': res.writeHead(302, { Location: 'http://192.168.0.1/camera.jpg' }); return res.end();
    default: res.writeHead(404); return res.end();
  }
});
await new Promise(resolve => site.listen(0, '127.0.0.1', resolve));
const port = site.address().port;
test.after(() => {
  site.closeAllConnections();
  site.close();
});

const HOSTS = {
  'shop.test': ['127.0.0.1'], 'cdn.shop.test': ['127.0.0.1'], 'private.test': ['192.168.1.20'], 'mixed.test': ['127.0.0.1', '10.0.0.7'],
  'ula.test': ['fd00::1', '127.0.0.1']
};
const testLookup = (hostname, _options, callback) => {
  const addresses = HOSTS[hostname];
  if (!addresses) return callback(Object.assign(new Error('Not found'), { code: 'ENOTFOUND' }));
  return callback(null, addresses.map(address => ({ address, family: address.includes(':') ? 6 : 4 })));
};
// Only the local test server's loopback address is reachable, standing in for the public internet.
const client = (options = {}) => new PublicWebClient({ lookup: testLookup, isAllowedAddress: address => address === '127.0.0.1', ...options });
const PAGE = { types: ['text/html'], maxBytes: 3 * 1024 * 1024 };
const shop = route => `http://shop.test:${port}${route}`;

test('a page is read through gzip and Brotli, and sends no cookies or credentials', async () => {
  const page = await client().get(shop('/product'), PAGE);
  assert.equal(page.url, shop('/product'));
  assert.equal(page.contentType, 'text/html');
  assert.equal(page.charset, 'utf-8');
  assert.match(page.body.toString('utf8'), /Trail Camera X200/);
  const brotli = await client().get(shop('/brotli'), PAGE);
  assert.match(brotli.body.toString('utf8'), /Folding Camp Lantern/);
  const headers = received.find(entry => entry.url === '/product').headers;
  for (const header of ['cookie', 'authorization', 'proxy-authorization', 'x-forwarded-for']) assert.equal(headers[header], undefined, header);
  assert.match(headers['user-agent'], /InventoryAtlasLite/);
});

test('every DNS answer and every redirect destination is checked before connecting', async () => {
  await refused(client().get(`http://private.test:${port}/product`, PAGE), 400, 'URL_IMPORT_BLOCKED_HOST');
  // One private answer among public ones is enough to refuse the host.
  await refused(client().get(`http://mixed.test:${port}/product`, PAGE), 400, 'URL_IMPORT_BLOCKED_HOST');
  await refused(client().get(`http://ula.test:${port}/product`, PAGE), 400, 'URL_IMPORT_BLOCKED_HOST');
  for (const route of ['/redirect-private', '/redirect-literal', '/redirect-localhost', '/redirect-metadata']) {
    await refused(client().get(shop(route), PAGE), 400, 'URL_IMPORT_BLOCKED_HOST');
  }
  await refused(client().get(shop('/redirect-file'), PAGE), 400, 'URL_IMPORT_UNSUPPORTED_PROTOCOL');
  await refused(client().get(shop('/loop'), PAGE), 502, 'URL_IMPORT_TOO_MANY_REDIRECTS');
  await refused(client().get(`http://unknown.test:${port}/`, PAGE), 502, 'URL_IMPORT_HOST_NOT_FOUND');
  assert.equal((await client().get(shop('/redirect-same'), PAGE)).url, shop('/product'));
});

test('a name that rebinds to a private address after the first check is refused on the next connection', async () => {
  let lookups = 0;
  const rebinding = (_hostname, _options, callback) => {
    lookups += 1;
    callback(null, [{ address: lookups === 1 ? '127.0.0.1' : '10.1.2.3', family: 4 }]);
  };
  await refused(client({ lookup: rebinding }).get(`http://rebind.test:${port}/redirect-same`, PAGE), 400, 'URL_IMPORT_BLOCKED_HOST');
  assert.equal(lookups, 2);
});

test('size, type, status, and time limits are enforced, including after decompression', async () => {
  await refused(client().get(shop('/big'), PAGE), 422, 'URL_IMPORT_TOO_LARGE');
  await refused(client().get(shop('/bomb'), PAGE), 422, 'URL_IMPORT_TOO_LARGE');
  await refused(client().get(shop('/declared-large'), PAGE), 422, 'URL_IMPORT_TOO_LARGE');
  await refused(client().get(shop('/corrupt-gzip'), PAGE), 422, 'URL_IMPORT_UNSUPPORTED_CONTENT');
  await refused(client().get(shop('/binary'), PAGE), 422, 'URL_IMPORT_UNSUPPORTED_CONTENT');
  await refused(client().get(shop('/forbidden'), PAGE), 502, 'URL_IMPORT_PAGE_REFUSED');
  await refused(client().get(shop('/missing'), PAGE), 502, 'URL_IMPORT_PAGE_UNAVAILABLE');
  const started = Date.now();
  await refused(client({ timeoutMs: 300 }).get(shop('/hang'), PAGE), 504, 'URL_IMPORT_TIMEOUT');
  assert.ok(Date.now() - started < 3000);
});

test('more parallel reads than allowed are refused instead of queued', async () => {
  const limited = client({ maxConcurrent: 1, timeoutMs: 400 });
  const first = limited.get(shop('/hang'), PAGE);
  await refused(limited.get(shop('/product'), PAGE), 429, 'URL_IMPORT_BUSY');
  await refused(first, 504, 'URL_IMPORT_TIMEOUT');
  assert.ok((await limited.get(shop('/product'), PAGE)).body.length > 0);
});

// ---------------------------------------------------------------------------------------------
// The preview service
// ---------------------------------------------------------------------------------------------

const buildInventory = () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  applySchema(db);
  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  const customFieldService = new CustomFieldService(customFieldRepository, categoryService);
  const itemService = new ItemService({
    itemRepository: new ItemRepository(db), customFieldRepository, itemPhotoRepository: new ItemPhotoRepository(db), categoryRepository,
    itemHistoryService: new ItemHistoryService({ itemHistoryRepository: new ItemHistoryRepository(db) })
  });
  return { db, categoryRepository, customFieldRepository, categoryService, customFieldService, itemService };
};

test('the preview maps base and custom fields, suggests an existing category, and keeps the page price a suggestion', async () => {
  const inventory = buildInventory();
  inventory.categoryService.create({ name: 'Tools' });
  const cameras = inventory.categoryService.create({ name: 'Camera' });
  for (const field of [{ name: 'Brand', type: 'text' }, { name: 'Waterproof', type: 'boolean' }, { name: 'Color', type: 'color' }]) {
    inventory.customFieldService.create(cameras.id, field);
  }
  const service = new UrlImportService({ webClient: client(), ...inventory });
  const preview = await service.preview({ url: shop('/product'), categoryId: cameras.id });
  assert.deepEqual(preview.baseFields, {
    name: 'Trail Camera X200',
    description: 'Weatherproof trail camera with night vision & 4K video.',
    source_url: `http://shop.test:${port}/products/trail-camera-x200`
  });
  // "Cameras" on the page is the existing "Camera"; no category is ever created.
  assert.equal(preview.suggestedCategoryId, cameras.id);
  assert.equal(inventory.categoryRepository.listNames().length, 2);
  assert.deepEqual(preview.customFields.map(field => [field.name, field.value]), [
    ['Brand', 'Fieldmark'], ['Waterproof', '1'], ['Color', '{"key":"black","hex":"#171717"}']
  ]);
  assert.equal(preview.price.candidates.length, 2);
  // Nothing in the preview can be read as a purchase price, a serial number, or a condition.
  for (const key of ['purchase_price', 'serial_number', 'is_new', 'condition_grade', 'condition_notes', 'purchase_date', 'location']) {
    assert.equal(key in preview.baseFields, false, key);
  }
  assert.match(preview.token, /^[0-9a-f-]{36}$/);
  assert.deepEqual(preview.images.map(image => image.index), [0, 1, 2]);

  // Images are fetched only by position within this preview, and each is verified to be a real image.
  const image = await service.image(preview.token, '0');
  assert.equal(image.mime, 'image/png');
  assert.equal(image.filename, 'product-image-1.png');
  assert.deepEqual(image.data, pngBytes);
  await refused(service.image(preview.token, '1'), 422, 'URL_IMPORT_IMAGE_INVALID');
  await refused(service.image(preview.token, '2'), 400, 'URL_IMPORT_BLOCKED_HOST');
  await refused(service.image(preview.token, '9'), 404, 'URL_IMPORT_IMAGE_NOT_FOUND');
  await refused(service.image(preview.token, `http://shop.test:${port}/images/x200-front.jpg`), 404, 'URL_IMPORT_IMAGE_NOT_FOUND');
  await refused(service.image('not-a-token', '0'), 404, 'URL_IMPORT_PREVIEW_EXPIRED');
});

test('previews expire, and pages without a product or with an unusable address are refused', async () => {
  let now = 1_000_000;
  const inventory = buildInventory();
  const service = new UrlImportService({ webClient: client(), ...inventory, now: () => now });
  const preview = await service.preview({ url: shop('/product') });
  assert.equal(preview.suggestedCategoryId, null);
  assert.deepEqual(preview.customFields, []);
  now += 31 * 60 * 1000;
  await refused(service.image(preview.token, '0'), 404, 'URL_IMPORT_PREVIEW_EXPIRED');
  await refused(service.preview({ url: shop('/empty') }), 422, 'URL_IMPORT_NO_PRODUCT');
  await refused(service.preview({ url: 'file:///etc/passwd' }), 400, 'URL_IMPORT_UNSUPPORTED_PROTOCOL');
  await refused(service.preview({ url: 'http://127.0.0.1:3000/' }), 400, 'URL_IMPORT_BLOCKED_HOST');
  await refused(service.preview({ url: shop('/product'), categoryId: 999 }), 400, 'CATEGORY_REQUIRED');
  const legacy = await service.preview({ url: shop('/windows-1251') });
  assert.equal(legacy.baseFields.name, 'Лампа');
});

// ---------------------------------------------------------------------------------------------
// Source URL on items
// ---------------------------------------------------------------------------------------------

test('Source URL is an optional, validated item value kept through edits', () => {
  const { categoryService, itemService } = buildInventory();
  const category = categoryService.create({ name: 'Lamps' });
  const created = itemService.create({ name: 'Desk lamp', category_id: category.id, source_url: ' https://Shop.Example/lamp#specs ' });
  assert.equal(created.source_url, 'https://shop.example/lamp#specs');
  const unchanged = itemService.update(created.id, { name: 'Desk lamp', category_id: category.id, source_url: created.source_url });
  assert.equal(unchanged.source_url, created.source_url);
  assert.equal(itemService.update(created.id, { name: 'Desk lamp', category_id: category.id, source_url: '' }).source_url, null);
  for (const value of ['javascript:alert(1)', 'ftp://shop.example/x', 'https://user:secret@shop.example/', 'not a url', 42]) {
    assert.throws(() => itemService.create({ name: 'X', category_id: category.id, source_url: value }), { code: 'INVALID_SOURCE_URL' }, String(value));
  }
  assert.throws(() => itemService.create({ name: 'X', category_id: category.id, source_url: `https://shop.example/${'a'.repeat(2100)}` }),
    { code: 'SOURCE_URL_TOO_LONG' });
});

test('the batch item import accepts a Source URL and reviews it with the item rules', () => {
  const [draft] = parseItemImportDocument(JSON.stringify({
    version: 1, category: 'Lamps', items: [{ name: 'Lamp', sourceUrl: 'mailto:shop@example.com' }]
  }), { categoryName: 'Lamps', fields: [] });
  assert.equal(draft.sourceUrl, 'mailto:shop@example.com');
  assert.deepEqual(reviewItemDraft(draft, []).sourceUrl, { code: 'INVALID_SOURCE_URL', params: {} });
});

// A version 10 database: the current schema without items.source_url.
const version10Database = db => {
  applySchema(db);
  db.exec(`
    ALTER TABLE items DROP COLUMN source_url;
    INSERT INTO categories (name) VALUES ('Lamps');
    INSERT INTO items (uuid, name, category_id) VALUES ('6f1d2a52-1d9b-4d6a-9b1e-2d0f8f1b7a10', 'Old lamp', 1);
  `);
  db.pragma('user_version = 10');
  return db;
};

test('version 11 adds items.source_url to an existing database and to a restored older backup', () => {
  assert.equal(SCHEMA_VERSION, 11);
  const db = version10Database(new Database(':memory:'));
  applySchema(db);
  assert.equal(Number(db.pragma('user_version', { simple: true })), 11);
  assert.deepEqual(db.prepare('SELECT name, source_url FROM items').get(), { name: 'Old lamp', source_url: null });

  const file = path.join(dataDir, 'version-10-backup.sqlite');
  version10Database(new Database(file)).close();
  const summary = validateStagedDatabase(file);
  assert.equal(summary.migratedFrom, 10);
  assert.equal(summary.schemaVersion, 11);
});

// ---------------------------------------------------------------------------------------------
// HTTP contract
// ---------------------------------------------------------------------------------------------

test('the API offers URL import, refuses local addresses, and never accepts an image address from the browser', async () => {
  const { child, base } = await startServer(await mkdtemp(path.join(os.tmpdir(), 'inventory-url-import-api-')));
  try {
    assert.equal((await (await fetch(`${base}/api/capabilities`)).json()).urlImport, true);
    const post = url => fetch(`${base}/api/items/import-url/preview`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url })
    });
    for (const url of [`http://127.0.0.1:${port}/product`, 'http://[::1]/', 'http://localhost/']) {
      const response = await post(url);
      assert.equal(response.status, 400);
      assert.deepEqual(await response.json(), { error: { code: 'URL_IMPORT_BLOCKED_HOST', params: {} } });
    }
    assert.equal((await post('file:///etc/passwd')).status, 400);
    const image = await fetch(`${base}/api/items/import-url/unknown/images/0`);
    assert.equal(image.status, 404);
    assert.equal((await image.json()).error.code, 'URL_IMPORT_PREVIEW_EXPIRED');
    // The local test server was never contacted by the application.
    assert.equal(received.filter(entry => entry.headers['user-agent']?.includes('InventoryAtlasLite') && !entry.headers.host.startsWith('shop.test')
      && !entry.headers.host.startsWith('cdn.shop.test') && !entry.headers.host.startsWith('rebind.test')).length, 0);
  } finally {
    await stopServer(child);
  }
});
