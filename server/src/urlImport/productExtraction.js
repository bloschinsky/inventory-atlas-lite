import { plainText, readHtml } from './htmlDocument.js';

/*
  Turns one static product page into raw product candidates, in priority order: schema.org Product or
  ProductGroup JSON-LD (including @graph and @id references), then Open Graph and other product meta
  tags, then the page's own title, first heading, and specification tables. Every value is plain text
  and remembers where it came from; nothing absent is guessed, and nothing is mapped to inventory
  fields here. Product identifiers (SKU, MPN, GTIN, model) describe the catalog product, never the
  physical item, so they are only ever offered as attributes.

  A page price is collected as candidates with their kind (offer, sale, regular, or the low and high
  ends of a range). Several different prices or currencies make the price ambiguous: the candidates
  are returned with a warning and nothing is chosen for the user.

  Pages are never rendered: a page that has scripts but almost no readable text is reported as built
  by JavaScript, so the user learns why so little was found.
*/
export const SOURCES = { jsonLd: 'json-ld', openGraph: 'open-graph', meta: 'meta', html: 'html' };

const MAX_NAME = 255;
const MAX_DESCRIPTION = 2000;
const MAX_IDENTIFIER = 64;
const MAX_ATTRIBUTE_VALUE = 255;
const MAX_ATTRIBUTES = 60;
const MAX_CATEGORIES = 20;
const MAX_IMAGES = 8;
const MAX_PRICES = 6;
const MAX_VARIANTS = 30;
const MAX_VARIANT_LABEL = 120;
// Visible characters below which a page with scripts is taken to be built in the browser.
const SCRIPT_PAGE_TEXT = 500;
const MAX_NODES = 5000;
const MAX_DEPTH = 12;
const MAX_URL_LENGTH = 2048;

const currencyCodes = new Set(Intl.supportedValuesOf('currency'));
const isObject = value => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const typesOf = node => [node?.['@type']].flat().filter(type => typeof type === 'string').map(type => type.split(/[/#:]/).pop().toLowerCase());
const isType = (node, ...types) => typesOf(node).some(type => types.includes(type));

// Shortens at a word boundary; `onTrim` is told when something was cut.
const clip = (text, max, onTrim) => {
  if (!text || text.length <= max) return text || '';
  onTrim?.();
  const cut = text.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max / 2)).trimEnd()}…`;
};

// JSON-LD nodes in document order. Top-level nodes (a block's own objects and @graph members) are
// the page's subjects; nested ones, such as related products, are only reachable through them.
function collectNodes(blocks) {
  const nodes = [];
  const topLevel = new Set();
  let invalid = false;
  const visit = (value, depth, top) => {
    if (nodes.length >= MAX_NODES || depth > MAX_DEPTH || !value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, depth + 1, top);
      return;
    }
    if (value['@type'] || value['@id']) {
      nodes.push(value);
      if (top) topLevel.add(value);
    }
    for (const [key, child] of Object.entries(value)) {
      if (child && typeof child === 'object') visit(child, depth + 1, top && key === '@graph');
    }
  };
  for (const block of blocks) {
    try {
      visit(JSON.parse(block.trim().replace(/^<!\[CDATA\[/, '').replace(/\]\]>$/, '')), 0, true);
    } catch {
      invalid = true;
    }
  }
  return { nodes, topLevel, invalid };
}

/*
  An amount as the API stores it ("1299.00"), or null. JSON-LD uses a dot for decimals; common
  thousands separators are accepted only where the reading is unambiguous, and anything else, a zero,
  or more than four decimals is refused rather than guessed.
*/
export function readAmount(raw) {
  let text = typeof raw === 'number' ? (Number.isFinite(raw) ? String(raw) : '') : typeof raw === 'string' ? raw : '';
  text = text.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(text)) text = text.replace(/,/g, '');
  else if (/^\d{1,3}(\.\d{3})+,\d{1,2}$/.test(text)) text = text.replace(/\./g, '').replace(',', '.');
  else if (/^\d+,\d{1,2}$/.test(text)) text = text.replace(',', '.');
  if (!/^\d{1,12}(\.\d+)?$/.test(text)) return null;
  const [whole, fraction = ''] = text.split('.');
  const decimals = fraction.replace(/0+$/, '');
  if (decimals.length > 4 || Number(text) <= 0) return null;
  return `${whole.replace(/^0+(?=\d)/, '')}.${decimals.padEnd(2, '0')}`;
}

export function readCurrency(raw) {
  const code = typeof raw === 'string' ? raw.trim().toUpperCase() : '';
  return /^[A-Z]{3}$/.test(code) && currencyCodes.has(code) ? code : null;
}

// A public http(s) address resolved against the page, or null. Data and script URLs never qualify.
function resolveUrl(raw, base) {
  if (typeof raw !== 'string' || !raw.trim() || raw.length > MAX_URL_LENGTH) return null;
  try {
    const url = new URL(raw.trim(), base);
    if ((url.protocol !== 'http:' && url.protocol !== 'https:') || url.username || url.password) return null;
    url.hash = '';
    return url.href.length <= MAX_URL_LENGTH ? url.href : null;
  } catch {
    return null;
  }
}

// The schema.org properties a variant usually differs by, under the attribute names they are offered as.
const VARIANT_PROPERTIES = [['Color', 'color'], ['Material', 'material'], ['Size', 'size'], ['Pattern', 'pattern']];
const MEASURES = [['Weight', 'weight'], ['Width', 'width'], ['Height', 'height'], ['Depth', 'depth']];
const IDENTITY = ['name', 'description', 'brand', 'model', 'sku', 'mpn', 'gtin'];
// Warnings about the page-level price and variants; a chosen variant replaces them with its own.
const VARIANT_SCOPED_WARNINGS = ['URL_IMPORT_WARNING_PRICE_AMBIGUOUS', 'URL_IMPORT_WARNING_PRICE_INVALID', 'URL_IMPORT_WARNING_VARIANTS'];

const addAttribute = (attributes, name, value, source) => {
  const clean = clip(plainText(String(value ?? '')), MAX_ATTRIBUTE_VALUE);
  const key = plainText(String(name ?? '')).slice(0, 80);
  if (key && clean && attributes.length < MAX_ATTRIBUTES && !attributes.some(entry => entry.name.toLowerCase() === key.toLowerCase())) {
    attributes.push({ name: key, value: clean, source });
  }
};

/*
  Besides the page-level result, a ProductGroup's variants (hasVariant, or products naming the group in
  isVariantOf) are read one by one, each with only its own identity, attributes, offers, and images.
  A single variant simply is the product. Several variants are offered for choice only when every one
  has a distinct label built from the properties they vary by; until one is chosen, the page-level
  result keeps nothing that belongs to a single variant (its prices, images, identifiers, or the values
  of the varying properties), so a store's preselected variant is never taken for the user's. Variants
  that cannot be told apart are not offered at all, with a warning.
*/
export function extractProduct(html, pageUrl) {
  const page = readHtml(html);
  const warnings = [];
  const warn = code => { if (!warnings.some(warning => warning.code === code)) warnings.push({ code, params: {} }); };
  const { nodes, topLevel, invalid } = collectNodes(page.jsonLd);
  if (invalid) warn('URL_IMPORT_WARNING_INVALID_JSON_LD');

  // Only full nodes are indexed; a bare { "@id" } is a reference to one of them, never its definition.
  const byId = new Map();
  for (const node of nodes) {
    if (typeof node['@id'] === 'string' && Object.keys(node).length > 1 && !byId.has(node['@id'])) byId.set(node['@id'], node);
  }
  const deref = value => (isObject(value) && typeof value['@id'] === 'string' && Object.keys(value).length === 1 ? byId.get(value['@id']) ?? value : value);
  const list = value => [value].flat().filter(entry => entry !== undefined && entry !== null).map(deref);
  const text = (value, max = MAX_ATTRIBUTE_VALUE) => {
    const entry = list(value)[0];
    if (typeof entry === 'string' || typeof entry === 'number') return clip(plainText(String(entry)), max);
    return isObject(entry) && entry.name !== undefined ? text(entry.name, max) : '';
  };
  const meta = key => plainText(page.metas.get(key)?.[0] ?? '');
  const trimmed = () => warn('URL_IMPORT_WARNING_TEXT_TRIMMED');
  const measure = value => {
    const entry = list(value)[0];
    if (!isObject(entry)) return text(entry);
    const amount = text(entry.value);
    return amount ? `${amount} ${text(entry.unitText) || text(entry.unitCode)}`.trim() : '';
  };
  // The identity and attributes one JSON-LD product node states itself.
  const describe = node => {
    const identity = {
      name: text(node.name, MAX_NAME),
      description: clip(text(node.description, Infinity), MAX_DESCRIPTION, trimmed),
      brand: text(node.brand) || text(node.manufacturer),
      model: text(node.model),
      sku: text(node.sku, MAX_IDENTIFIER),
      mpn: text(node.mpn, MAX_IDENTIFIER),
      gtin: text(node.gtin ?? node.gtin13 ?? node.gtin12 ?? node.gtin14 ?? node.gtin8 ?? node.isbn, MAX_IDENTIFIER)
    };
    const attributes = [];
    for (const [name, key] of VARIANT_PROPERTIES) addAttribute(attributes, name, text(node[key]), SOURCES.jsonLd);
    for (const [name, key] of MEASURES) addAttribute(attributes, name, measure(node[key]), SOURCES.jsonLd);
    for (const property of list(node.additionalProperty).filter(isObject)) {
      addAttribute(attributes, text(property.name, 80), measure(property), SOURCES.jsonLd);
    }
    return { identity, attributes };
  };

  // The page's product: a ProductGroup when there is one, otherwise the first Product.
  const products = nodes.filter(node => isType(node, 'product', 'productgroup'));
  const subjects = products.filter(node => topLevel.has(node));
  const candidates = subjects.length ? subjects : products;
  const main = candidates.find(node => isType(node, 'productgroup')) ?? candidates[0] ?? null;
  const variantNodes = main && isType(main, 'productgroup')
    ? [...new Set([...list(main.hasVariant), ...products.filter(node => node !== main && list(node.isVariantOf).includes(main))])].filter(isObject)
    : [];
  if (main && candidates.some(node => node !== main && !variantNodes.includes(node) && text(node.name) !== text(main.name))) {
    warn('URL_IMPORT_WARNING_MULTIPLE_PRODUCTS');
  }
  const severalVariants = variantNodes.length > 1;

  const product = { name: '', brand: '', model: '', description: '', sku: '', mpn: '', gtin: '' };
  const provenance = {};
  const set = (key, value, source) => {
    if (value && !product[key]) {
      product[key] = value;
      provenance[key] = source;
    }
  };
  const attributes = [];
  if (main) {
    const own = describe(main);
    for (const key of IDENTITY) set(key, own.identity[key], SOURCES.jsonLd);
    for (const attribute of own.attributes) addAttribute(attributes, attribute.name, attribute.value, attribute.source);
  }
  // A single variant is simply the product: it adds what the group itself does not state.
  if (variantNodes.length === 1) {
    const only = describe(variantNodes[0]);
    for (const key of IDENTITY) set(key, only.identity[key], SOURCES.jsonLd);
    for (const attribute of only.attributes) addAttribute(attributes, attribute.name, attribute.value, attribute.source);
  }
  set('name', clip(meta('og:title'), MAX_NAME), SOURCES.openGraph);
  set('name', clip(page.h1, MAX_NAME), SOURCES.html);
  set('name', clip(page.title, MAX_NAME), SOURCES.html);
  set('description', clip(meta('og:description'), MAX_DESCRIPTION, trimmed), SOURCES.openGraph);
  set('description', clip(meta('description'), MAX_DESCRIPTION, trimmed), SOURCES.meta);
  set('brand', clip(meta('product:brand') || meta('og:brand'), MAX_ATTRIBUTE_VALUE), SOURCES.openGraph);
  set('brand', clip(meta('brand'), MAX_ATTRIBUTE_VALUE), SOURCES.meta);
  // With several variants, page-level identifiers usually belong to the store's preselected one.
  if (!severalVariants) {
    set('sku', clip(meta('product:retailer_item_id') || meta('sku'), MAX_IDENTIFIER), SOURCES.meta);
    set('mpn', clip(meta('product:mfr_part_no') || meta('mpn'), MAX_IDENTIFIER), SOURCES.meta);
    set('gtin', clip(meta('product:upc') || meta('product:ean') || meta('gtin13') || meta('gtin'), MAX_IDENTIFIER), SOURCES.meta);
  }
  for (const spec of page.specs) addAttribute(attributes, spec.name, spec.value, SOURCES.html);

  // Category names as the page states them, only for suggesting an existing category.
  const categories = [];
  const addCategory = value => {
    for (const part of String(value || '').split(/\s*[>/|›»]\s*/)) {
      const name = plainText(part).slice(0, 80);
      if (name && categories.length < MAX_CATEGORIES && !categories.includes(name)) categories.push(name);
    }
  };
  if (main) for (const category of list(main.category)) addCategory(typeof category === 'string' ? category : text(category));
  for (const crumbs of nodes.filter(node => isType(node, 'breadcrumblist'))) {
    for (const entry of list(crumbs.itemListElement).filter(isObject)) addCategory(text(entry.name) || text(deref(entry.item)));
  }
  addCategory(meta('product:category'));

  // Each variant on its own: no page meta tags, which describe the page's preselected variant at best.
  const options = (severalVariants ? variantNodes.slice(0, MAX_VARIANTS) : []).map(node => {
    const { identity, attributes: own } = describe(node);
    const price = readPrices({ nodes: [node], list, meta: () => '' });
    return { identity, attributes: own, price: price.price, priceWarnings: price.warnings, images: readImages({ nodes: [node], list, pageUrl }) };
  });
  const varying = severalVariants ? varyingNames(main, options, list) : [];
  const variants = severalVariants ? labelVariants(options, varying) : [];
  if (severalVariants) {
    if (variants.length) warn('URL_IMPORT_WARNING_VARIANTS');
    else warn('URL_IMPORT_WARNING_VARIANTS_AMBIGUOUS');
    if (variantNodes.length > MAX_VARIANTS && variants.length) warn('URL_IMPORT_WARNING_VARIANTS_LIMITED');
  }

  // The page-level price and images: only the group's own when it has several variants, never one variant's.
  const priceNodes = [main, ...(severalVariants ? [] : variantNodes)].filter(Boolean);
  const price = readPrices({ nodes: priceNodes, list, meta });
  for (const code of price.warnings) warn(code);
  // Page image tags, like its other meta tags, usually show the preselected variant.
  const images = readImages({ nodes: priceNodes, list, page: severalVariants ? null : page, pageUrl });
  const canonical = page.links.find(link => link.rel.split(/\s+/).includes('canonical'))?.href || page.metas.get('og:url')?.[0];

  // A page with almost no static text but scripts most likely builds its product details in the browser.
  const structured = Boolean(main) || /product/i.test(meta('og:type')) || price.price.candidates.length > 0 || page.specs.length > 0;
  const scriptRendered = !structured && page.scripts > 0 && page.textLength < SCRIPT_PAGE_TEXT;
  if (!structured) warn(scriptRendered ? 'URL_IMPORT_WARNING_SCRIPT_RENDERED' : 'URL_IMPORT_WARNING_NO_PRODUCT_DATA');

  return {
    product: { ...product, categories, attributes: attributes.filter(attribute => !varying.includes(attribute.name.toLowerCase())) },
    provenance,
    price: price.price,
    images,
    canonicalUrl: resolveUrl(canonical, pageUrl),
    scriptRendered,
    warnings,
    variants,
    variant: null
  };
}

/*
  The page result for one of its variants: the variant's own name, identifiers, attributes, offers, and
  images, with the group's shared description, brand, categories, and the other attributes the
  variant does not state. Identifiers never fall back to the group's, and price and images come only
  from the variant: nothing is taken from another variant.
*/
export function selectVariant(extraction, index) {
  const variant = extraction.variants[index];
  const product = { ...extraction.product, sku: '', mpn: '', gtin: '' };
  const provenance = { ...extraction.provenance };
  for (const key of ['sku', 'mpn', 'gtin']) delete provenance[key];
  for (const key of IDENTITY) {
    if (variant.identity[key]) {
      product[key] = variant.identity[key];
      provenance[key] = SOURCES.jsonLd;
    }
  }
  const own = new Set(variant.attributes.map(attribute => attribute.name.toLowerCase()));
  product.attributes = [...variant.attributes, ...extraction.product.attributes.filter(attribute => !own.has(attribute.name.toLowerCase()))]
    .slice(0, MAX_ATTRIBUTES);
  const warnings = extraction.warnings.filter(warning => !VARIANT_SCOPED_WARNINGS.includes(warning.code));
  for (const code of variant.priceWarnings) if (!warnings.some(warning => warning.code === code)) warnings.push({ code, params: {} });
  return { ...extraction, product, provenance, price: variant.price, images: variant.images, warnings, variant: index };
}

// The attribute names the variants differ by: the ones the group declares in variesBy, and any that differ.
function varyingNames(main, options, list) {
  const declared = list(main.variesBy).filter(value => typeof value === 'string').map(value => value.split(/[/#:]/).pop().toLowerCase());
  const valueOf = (option, name) => option.attributes.find(attribute => attribute.name.toLowerCase() === name)?.value ?? '';
  const names = [...new Set(options.flatMap(option => option.attributes.map(attribute => attribute.name.toLowerCase())))];
  return names.filter(name => declared.includes(name) || new Set(options.map(option => valueOf(option, name))).size > 1);
}

// Each variant's label from its varying values, else its name, else its SKU; [] when any two are alike.
function labelVariants(options, varying) {
  const labelled = options.map(option => {
    const values = varying.map(name => option.attributes.find(attribute => attribute.name.toLowerCase() === name)?.value).filter(Boolean);
    return { ...option, label: clip(values.join(' / ') || option.identity.name || option.identity.sku, MAX_VARIANT_LABEL) };
  });
  const labels = new Set(labelled.map(option => option.label.toLowerCase()));
  return labelled.every(option => option.label) && labels.size === labelled.length ? labelled : [];
}

function readPrices({ nodes, list, meta }) {
  const candidates = [];
  const warnings = new Set();
  let range = false;
  const add = (amountRaw, currencyRaw, kind, source) => {
    // An offer without any amount, such as one that is out of stock, simply has no price.
    if (amountRaw === undefined || amountRaw === null || amountRaw === '') return;
    const amount = readAmount(amountRaw);
    const currency = readCurrency(currencyRaw);
    if (!amount || !currency) {
      warnings.add('URL_IMPORT_WARNING_PRICE_INVALID');
      return;
    }
    if (!candidates.some(entry => entry.amount === amount && entry.currency === currency && entry.kind === kind)) {
      candidates.push({ amount, currency, kind, source });
    }
  };
  const readOffer = (offer, depth = 0) => {
    if (!offer || typeof offer !== 'object' || depth > 2) return;
    if (isType(offer, 'aggregateoffer')) {
      const currency = offer.priceCurrency;
      const low = readAmount(offer.lowPrice);
      const high = readAmount(offer.highPrice);
      if (low && high && low !== high) {
        range = true;
        add(offer.lowPrice, currency, 'low', SOURCES.jsonLd);
        add(offer.highPrice, currency, 'high', SOURCES.jsonLd);
      } else {
        add(offer.lowPrice ?? offer.price ?? offer.highPrice, currency, 'offer', SOURCES.jsonLd);
      }
      for (const nested of list(offer.offers)) readOffer(nested, depth + 1);
      return;
    }
    const specifications = list(offer.priceSpecification).filter(isObject);
    const regular = specifications.filter(spec => /strikethrough|listprice|msrp|srp/i.test(String(spec.priceType ?? '')));
    const current = specifications.find(spec => !regular.includes(spec) && spec.price !== undefined);
    for (const spec of regular) add(spec.price, spec.priceCurrency ?? offer.priceCurrency, 'regular', SOURCES.jsonLd);
    add(offer.price ?? current?.price, offer.priceCurrency ?? current?.priceCurrency, regular.length ? 'sale' : 'offer', SOURCES.jsonLd);
  };
  for (const node of nodes) {
    for (const offer of list(node.offers)) readOffer(offer);
  }
  if (!candidates.length) {
    const sale = meta('product:sale_price:amount');
    const regular = meta('product:original_price:amount');
    add(meta('product:price:amount') || meta('og:price:amount'), meta('product:price:currency') || meta('og:price:currency'),
      sale ? 'regular' : 'offer', SOURCES.openGraph);
    add(sale, meta('product:sale_price:currency') || meta('product:price:currency'), 'sale', SOURCES.openGraph);
    add(regular, meta('product:original_price:currency') || meta('product:price:currency'), 'regular', SOURCES.openGraph);
  }
  if (!candidates.length) add(meta('price'), meta('pricecurrency'), 'offer', SOURCES.meta);

  // A regular price beside its sale price is one reading; several current prices or currencies are not.
  const current = new Set(candidates.filter(entry => entry.kind !== 'regular').map(entry => `${entry.amount} ${entry.currency}`));
  const currencies = new Set(candidates.map(entry => entry.currency));
  const ambiguous = range || current.size > 1 || currencies.size > 1;
  if (ambiguous) warnings.add('URL_IMPORT_WARNING_PRICE_AMBIGUOUS');
  return { price: { candidates: candidates.slice(0, MAX_PRICES), ambiguous }, warnings: [...warnings] };
}

// The images of the given JSON-LD nodes, then, for the page itself, its image meta and link tags.
function readImages({ nodes, list, page = null, pageUrl }) {
  const images = [];
  const add = (raw, source) => {
    const url = resolveUrl(raw, pageUrl);
    if (url && images.length < MAX_IMAGES && !images.some(image => image.url === url)) images.push({ url, source });
  };
  const fromJsonLd = value => list(value).flatMap(entry => (typeof entry === 'string' ? [entry]
    : isObject(entry) ? [entry.contentUrl ?? entry.url].flat().filter(url => typeof url === 'string') : []));
  for (const node of nodes) for (const url of fromJsonLd(node.image)) add(url, SOURCES.jsonLd);
  if (!page) return images;
  for (const key of ['og:image:secure_url', 'og:image', 'og:image:url']) for (const url of page.metas.get(key) ?? []) add(url, SOURCES.openGraph);
  for (const key of ['twitter:image', 'twitter:image:src', 'image']) for (const url of page.metas.get(key) ?? []) add(url, SOURCES.meta);
  for (const link of page.links.filter(entry => entry.rel === 'image_src')) add(link.href, SOURCES.html);
  return images;
}
