/*
  A bounded reader of the few parts of a static HTML page the URL import uses: the title, the first
  heading, meta and link tags, JSON-LD blocks, and two-column specification tables and definition
  lists. It never builds a DOM and never runs anything: scripts are only read as JSON-LD text or
  dropped. The input is cut to a fixed size, each kind of result has its own limit, and every
  pattern stays linear: tag attributes stop at the next "<", and an element that is never closed
  simply runs to the end of the page instead of being searched for again from every later position.
*/
const MAX_HTML_CHARS = 2_000_000;
const MAX_JSON_LD_BLOCKS = 20;
const MAX_JSON_LD_CHARS = 500_000;
const MAX_TAGS = 4000;
const MAX_SPEC_BLOCKS = 20;
const MAX_SPECS = 60;
const MAX_SPEC_NAME = 80;
const MAX_SPEC_VALUE = 255;

const NAMED_ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', bull: '•', middot: '·', copy: '©', reg: '®', trade: '™', deg: '°',
  times: '×', euro: '€', pound: '£', yen: '¥', cent: '¢', sup2: '²', sup3: '³', frac12: '½', micro: 'µ', shy: ''
};

const codePoint = number => (Number.isInteger(number) && number > 0 && number <= 0x10ffff && (number < 0xd800 || number > 0xdfff)
  ? String.fromCodePoint(number) : '\uFFFD');

export const decodeEntities = text => text.replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z][a-z0-9]{1,31}));/gi, (entity, decimal, hex, name) => {
  if (decimal) return codePoint(Number(decimal));
  if (hex) return codePoint(Number.parseInt(hex, 16));
  return NAMED_ENTITIES[name.toLowerCase()] ?? entity;
});

const TAG = /<[^<>]*>/g;
// Elements whose content is never readable text.
const RAW_TEXT = /<(script|style)\b[^<>]{0,2000}>[\s\S]*?(?:<\/\1\s*>|$)/gi;
const stripMarkup = text => text.replace(RAW_TEXT, ' ').replace(TAG, ' ');
// eslint-disable-next-line no-control-regex
const INVISIBLE = /[\u0000-\u0008\u000b-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

/*
  Plain text from markup or from a remote string: tags are removed before and after entities are
  decoded, so escaped markup such as &lt;script&gt; never survives as markup either, and script or
  style content is dropped with its tags. Control and invisible formatting characters are dropped
  and whitespace is collapsed.
*/
export const plainText = value => stripMarkup(decodeEntities(stripMarkup(String(value ?? ''))))
  .replace(INVISIBLE, '')
  .replace(/\s+/g, ' ')
  .trim();

const readAttributes = source => {
  const attributes = {};
  for (const match of source.matchAll(/([^\s=/>"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>"']+)))?/g)) {
    const name = match[1].toLowerCase();
    if (!(name in attributes)) attributes[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attributes;
};

// Pairs of [name, value] cells; only rows or entries of exactly one name and one value are read.
function readSpecs(html) {
  const specs = [];
  const add = (name, value) => {
    const key = plainText(name).replace(/:$/, '').trim();
    const text = plainText(value);
    if (key && text && key.length <= MAX_SPEC_NAME && specs.length < MAX_SPECS) specs.push({ name: key, value: text.slice(0, MAX_SPEC_VALUE) });
  };
  let blocks = 0;
  for (const [, table] of html.matchAll(/<table\b[^<>]{0,2000}>([\s\S]*?)(?:<\/table\s*>|$)/gi)) {
    if (++blocks > MAX_SPEC_BLOCKS) break;
    for (const row of table.split(/<tr\b[^<>]{0,2000}>/i).slice(1)) {
      const cells = [...row.matchAll(/<(?:th|td)\b[^<>]{0,2000}>([\s\S]*?)(?=<\/?(?:th|td|tr|tbody|thead|tfoot)\b|$)/gi)].map(match => match[1]);
      if (cells.length === 2) add(cells[0], cells[1]);
    }
  }
  for (const [, list] of html.matchAll(/<dl\b[^<>]{0,2000}>([\s\S]*?)(?:<\/dl\s*>|$)/gi)) {
    if (++blocks > MAX_SPEC_BLOCKS) break;
    const entries = [...list.matchAll(/<(dt|dd)\b[^<>]{0,2000}>([\s\S]*?)(?=<\/?(?:dt|dd)\b|$)/gi)];
    for (let index = 0; index + 1 < entries.length; index += 1) {
      if (entries[index][1].toLowerCase() === 'dt' && entries[index + 1][1].toLowerCase() === 'dd') add(entries[index][2], entries[index + 1][2]);
    }
  }
  return specs;
}

const firstText = (html, tag) => plainText(html.match(new RegExp(`<${tag}\\b[^<>]{0,2000}>([\\s\\S]*?)(?:</${tag}\\s*>|$)`, 'i'))?.[1] ?? '');

export function readHtml(source) {
  const jsonLd = [];
  let html = String(source).slice(0, MAX_HTML_CHARS).replace(/<!--[\s\S]*?(?:-->|$)/g, ' ');
  html = html.replace(/<script\b([^<>]{0,2000})>([\s\S]*?)(?:<\/script\s*>|$)/gi, (_match, attributes, content) => {
    if (/application\/ld\+json/i.test(readAttributes(attributes).type ?? '') && jsonLd.length < MAX_JSON_LD_BLOCKS && content.length <= MAX_JSON_LD_CHARS) {
      jsonLd.push(content);
    }
    return ' ';
  });
  html = html.replace(/<(style|noscript|template|svg|textarea|iframe|object)\b[^<>]{0,2000}>[\s\S]*?(?:<\/\1\s*>|$)/gi, ' ');

  // Meta values are keyed by property, name, or itemprop, lower-cased; a key may repeat (og:image).
  const metas = new Map();
  const links = [];
  let tags = 0;
  for (const [, name, attributeText] of html.matchAll(/<(meta|link)\b([^<>]{0,4000})>/gi)) {
    if (++tags > MAX_TAGS) break;
    const attributes = readAttributes(attributeText);
    if (name.toLowerCase() === 'meta') {
      const key = (attributes.property || attributes.name || attributes.itemprop || '').trim().toLowerCase();
      const value = attributes.content ?? '';
      if (key && value.trim()) metas.set(key, [...(metas.get(key) ?? []), value.trim()]);
    } else if (attributes.rel && attributes.href) {
      links.push({ rel: attributes.rel.trim().toLowerCase(), href: attributes.href.trim() });
    }
  }
  return { title: firstText(html, 'title'), h1: firstText(html, 'h1'), metas, links, jsonLd, specs: readSpecs(html) };
}
