import crypto from 'node:crypto';
import sharp from 'sharp';
import { httpError } from '../httpError.js';
import { detectImageMime } from '../imageMime.js';
import { readPublicUrl } from '../integrations/publicAddress.js';
import { extractProduct, selectVariant } from '../urlImport/productExtraction.js';
import { matchCustomFields, productAttributes } from '../../../shared/productImport.js';
import { validateSourceUrl } from '../../../shared/itemValidation.js';

const PAGE_TYPES = ['text/html', 'application/xhtml+xml'];
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_PAGE_BYTES = 3 * 1024 * 1024;
// The same per-file limit as a photo upload, which every imported image still goes through.
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGE_PIXELS = 50_000_000;
const SESSION_TTL_MS = 30 * 60 * 1000;
const MAX_SESSIONS = 100;
const IMAGE_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif' };

// The charset of the response, else of a <meta> near the top of the page, else UTF-8.
function decodePage(body, charset) {
  const declared = charset || body.subarray(0, 4096).toString('latin1').match(/<meta[^>]{0,200}charset\s*=\s*["']?\s*([\w.:-]+)/i)?.[1];
  try {
    return new TextDecoder(declared || 'utf-8').decode(body);
  } catch {
    return new TextDecoder('utf-8').decode(body);
  }
}

const categoryKey = name => String(name).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const singular = key => key.replace(/(?<=\w{3})s$/, '');

/*
  An existing category whose name the page states as its category or breadcrumb, the most specific
  first; plural and singular forms count as one name. Nothing is suggested otherwise.
*/
function suggestCategory(hints, categories) {
  for (const hint of [...hints].reverse()) {
    const key = categoryKey(hint);
    const found = categories.find(category => categoryKey(category.name) === key || singular(categoryKey(category.name)) === singular(key));
    if (found) return found.id;
  }
  return null;
}

const sameSite = (first, second) => new URL(first).hostname.replace(/^www\./, '') === new URL(second).hostname.replace(/^www\./, '');

/*
  Smart URL import: reads a public product page and returns a normalized, review-only preview. It
  never writes inventory data: the user reviews the preview and saves through the regular item API
  and its validation. The preview separates the raw product candidates, the base fields and existing
  custom fields they map to, the page price candidates (a suggestion, never a purchase price), the
  image candidates, the proposed source URL, warnings, and the provenance of each value.

  Image candidates are kept server-side under a short-lived random token, so the browser can only
  ask for "image 2 of this preview"; it can never make the server fetch an address of its choosing.
  The extracted product facts are kept under the same token for the optional AI enhancement, which
  therefore never has to trust a product description sent back by the browser.

  When the page offers several distinguishable variants, the preview lists them and holds only what
  they share. Choosing one builds a new preview with a new token from the same reading of the page
  (nothing is fetched again), with that variant's own identity, attributes, prices, and images.
  Refresh from Source is the same preview of an item's saved Source URL, read only when the user asks.
*/
export class UrlImportService {
  constructor({ webClient, categoryRepository, customFieldRepository, now = Date.now }) {
    this.web = webClient;
    this.categories = categoryRepository;
    this.fields = customFieldRepository;
    this.now = now;
    this.sessions = new Map();
  }

  async preview(body) {
    const pageUrl = readPublicUrl(body?.url).href;
    const category = this.category(body);
    const page = await this.web.get(pageUrl, {
      types: PAGE_TYPES, maxBytes: MAX_PAGE_BYTES, accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.1'
    });
    const extraction = extractProduct(decodePage(page.body, page.charset), page.url);
    if (!extraction.product.name) throw httpError(422, extraction.scriptRendered ? 'URL_IMPORT_SCRIPT_RENDERED' : 'URL_IMPORT_NO_PRODUCT');

    // The page's canonical address is preferred only while it stays on the same site.
    const canonical = extraction.canonicalUrl && sameSite(extraction.canonicalUrl, page.url) ? extraction.canonicalUrl : page.url;
    let sourceUrl;
    try {
      sourceUrl = validateSourceUrl(canonical);
    } catch {
      sourceUrl = validateSourceUrl(page.url);
    }
    return this.build({ extraction, pageUrl: page.url, sourceUrl, fetchedAt: new Date(this.now()).toISOString() }, extraction, category);
  }

  // The preview of one variant of an earlier preview; an `index` of null returns to the shared details.
  variant(token, body) {
    const { reading } = this.session(token);
    const raw = body?.index;
    const index = raw === null || raw === undefined || raw === '' ? null
      : typeof raw === 'number' ? raw : typeof raw === 'string' && /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (index !== null && !(Number.isInteger(index) && index >= 0 && index < reading.extraction.variants.length)) {
      throw httpError(404, 'URL_IMPORT_VARIANT_NOT_FOUND');
    }
    const category = this.category(body);
    return this.build(reading, index === null ? reading.extraction : selectVariant(reading.extraction, index), category);
  }

  category(body) {
    const categoryId = body?.categoryId === undefined || body?.categoryId === null || body?.categoryId === '' ? null : Number.parseInt(body.categoryId);
    const category = categoryId === null ? null : this.categories.findById(categoryId);
    if (categoryId !== null && !category) throw httpError(400, 'CATEGORY_REQUIRED');
    return category;
  }

  /*
    `reading` is one read of the page (its extraction, final address, proposed Source URL, and time),
    shared by every view of it; `view` is the page-level extraction or one variant of it.
  */
  build(reading, view, category) {
    const { product, provenance, price, images } = view;
    const fields = category ? this.fields.listByCategory(category.id) : [];
    const { matches, ambiguous } = matchCustomFields(productAttributes(product, provenance), fields);
    const warnings = [...view.warnings, ...ambiguous.map(field => ({ code: 'URL_IMPORT_WARNING_FIELD_AMBIGUOUS', params: { field } }))];

    return {
      token: this.remember({ reading, images, facts: { product, provenance, price } }),
      pageUrl: reading.pageUrl,
      fetchedAt: reading.fetchedAt,
      product,
      provenance,
      baseFields: { name: product.name, description: product.description || null, source_url: reading.sourceUrl },
      suggestedCategoryId: suggestCategory(product.categories, this.categories.listNames()),
      categoryId: category?.id ?? null,
      customFields: matches,
      price,
      images: images.map((image, index) => ({ index, url: image.url, source: image.source })),
      // Each variant's label and, only when it has exactly one current price, that offer for the picker.
      variants: reading.extraction.variants.map(({ label, price: offers }, index) => {
        const [offer, ...others] = offers.candidates.filter(candidate => candidate.kind !== 'regular');
        return { index, label, offer: offer && !others.length && !offers.ambiguous ? { amount: offer.amount, currency: offer.currency } : null };
      }),
      variant: view.variant,
      warnings
    };
  }

  // One image candidate of a preview, checked to be a real, reasonably sized JPEG, PNG, WebP, or GIF.
  async image(token, index) {
    const image = this.session(token).images[Number.parseInt(index)];
    if (!image || !/^\d+$/.test(String(index))) throw httpError(404, 'URL_IMPORT_IMAGE_NOT_FOUND');
    const file = await this.web.get(image.url, { types: IMAGE_TYPES, maxBytes: MAX_IMAGE_BYTES });
    const mime = detectImageMime(file.body);
    if (!mime) throw httpError(422, 'URL_IMPORT_IMAGE_INVALID');
    try {
      const { width, height } = await sharp(file.body, { animated: false, limitInputPixels: MAX_IMAGE_PIXELS }).metadata();
      if (!width || !height || width * height > MAX_IMAGE_PIXELS) throw new Error('Image size');
    } catch {
      throw httpError(422, 'URL_IMPORT_IMAGE_INVALID');
    }
    return { mime, data: file.body, filename: `product-image-${Number(index) + 1}.${IMAGE_EXTENSIONS[mime]}` };
  }

  // The product facts the server itself extracted for this preview.
  facts(token) {
    return this.session(token).facts;
  }

  session(token) {
    const session = this.sessions.get(String(token));
    if (!session || session.expiresAt < this.now()) throw httpError(404, 'URL_IMPORT_PREVIEW_EXPIRED');
    return session;
  }

  remember({ reading, images, facts }) {
    const now = this.now();
    for (const [token, session] of this.sessions) if (session.expiresAt < now) this.sessions.delete(token);
    while (this.sessions.size >= MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value);
    const token = crypto.randomUUID();
    this.sessions.set(token, { reading, images, facts, expiresAt: now + SESSION_TTL_MS });
    return token;
  }
}
