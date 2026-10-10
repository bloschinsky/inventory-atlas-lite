import dns from 'node:dns';
import http from 'node:http';
import https from 'node:https';
import { pipeline } from 'node:stream';
import zlib from 'node:zlib';
import { AppError } from '../../../shared/appError.js';
import { isPublicAddress, readPublicUrl } from './publicAddress.js';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);
// Answers that mean the site wants a login, a human, or a different visitor; they are never worked around.
const REFUSED_STATUSES = new Set([401, 402, 403, 407, 429, 451]);

const failure = (code, status, params = {}) => new AppError(code, params, status);

const DECODERS = {
  gzip: () => zlib.createGunzip(),
  'x-gzip': () => zlib.createGunzip(),
  deflate: () => zlib.createInflate(),
  br: () => zlib.createBrotliDecompress()
};

/*
  Reads one public web resource for the URL import, and nothing else: no cookies, no credentials, no
  proxy, and no headers from the browser request are ever sent. Every hop is checked before it is
  made: the address must be public (readPublicUrl), each DNS answer is checked inside the
  connection's own lookup so the address that is validated is the one that is connected to (no DNS
  rebinding between check and use), redirects are followed by hand up to a small limit and each new
  destination is checked again. The whole read shares one deadline, the response must have one of
  the expected types, and its size is limited after decompression, so a compressed bomb stops at the
  limit. A small number of reads may run at the same time; more are refused rather than queued.

  `lookup` and `isAllowedAddress` exist so the tests can point names at a local test server; the
  application always uses the system resolver and the public-address policy.
*/
export class PublicWebClient {
  constructor({
    lookup = dns.lookup, isAllowedAddress = isPublicAddress, timeoutMs = 15000, maxRedirects = 4, maxConcurrent = 4,
    userAgent = 'Mozilla/5.0 (compatible; InventoryAtlasLite; product page import)'
  } = {}) {
    Object.assign(this, { lookup, isAllowedAddress, timeoutMs, maxRedirects, maxConcurrent, userAgent });
    this.active = 0;
  }

  /*
    `types` are the accepted media types and `maxBytes` the decompressed size limit. Returns the
    final address after redirects, the media type, its charset parameter, and the body bytes.
  */
  async get(rawUrl, { types, maxBytes, accept = types.join(', ') }) {
    if (this.active >= this.maxConcurrent) throw failure('URL_IMPORT_BUSY', 429);
    this.active += 1;
    const deadline = { expired: false };
    const timer = setTimeout(() => {
      deadline.expired = true;
      deadline.abort?.();
    }, this.timeoutMs);
    try {
      let url = readPublicUrl(String(rawUrl), this.isAllowedAddress);
      for (let hop = 0; ; hop += 1) {
        const response = await this.request(url, accept, deadline);
        if (REDIRECT_STATUSES.has(response.statusCode)) {
          response.destroy();
          const location = response.headers.location;
          if (!location) throw failure('URL_IMPORT_PAGE_UNAVAILABLE', 502, { status: response.statusCode });
          if (hop >= this.maxRedirects) throw failure('URL_IMPORT_TOO_MANY_REDIRECTS', 502);
          let next;
          try {
            next = new URL(location, url).href;
          } catch {
            throw failure('URL_IMPORT_PAGE_UNAVAILABLE', 502, { status: response.statusCode });
          }
          url = readPublicUrl(next, this.isAllowedAddress);
          continue;
        }
        return await this.readResponse(url, response, { types, maxBytes });
      }
    } catch (error) {
      if (deadline.expired) throw failure('URL_IMPORT_TIMEOUT', 504);
      throw this.translate(error);
    } finally {
      clearTimeout(timer);
      this.active -= 1;
    }
  }

  request(url, accept, deadline) {
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const request = transport.request(url, {
        method: 'GET',
        // A fresh agent per request: no pooled socket and no proxy taken from the environment.
        agent: false,
        lookup: (hostname, options, callback) => this.checkedLookup(hostname, options, callback),
        headers: { 'User-Agent': this.userAgent, Accept: accept, 'Accept-Encoding': 'gzip, deflate, br', 'Accept-Language': 'en, *;q=0.5' }
      });
      deadline.abort = () => request.destroy(new Error('timeout'));
      request.on('response', resolve);
      request.on('error', reject);
      request.end();
    });
  }

  // Every answer must be allowed, not just the first, so a mixed answer cannot be used to reach a private host.
  checkedLookup(hostname, options, callback) {
    this.lookup(hostname, { family: options?.family ?? 0, all: true, verbatim: true }, (error, addresses) => {
      if (error) return callback(error);
      if (!addresses?.length) return callback(Object.assign(new Error('No address'), { code: 'ENOTFOUND' }));
      if (!addresses.every(entry => this.isAllowedAddress(entry.address))) {
        return callback(Object.assign(new Error('Blocked address'), { blockedAddress: true }));
      }
      if (options?.all) return callback(null, addresses);
      return callback(null, addresses[0].address, addresses[0].family);
    });
  }

  async readResponse(url, response, { types, maxBytes }) {
    const status = response.statusCode;
    if (status < 200 || status > 299) {
      response.destroy();
      if (REFUSED_STATUSES.has(status)) throw failure('URL_IMPORT_PAGE_REFUSED', 502, { status });
      throw failure('URL_IMPORT_PAGE_UNAVAILABLE', 502, { status });
    }
    const [mediaType, ...parameters] = String(response.headers['content-type'] || '').split(';');
    const contentType = mediaType.trim().toLowerCase();
    if (!types.includes(contentType)) {
      response.destroy();
      throw failure('URL_IMPORT_UNSUPPORTED_CONTENT', 422);
    }
    const declared = Number(response.headers['content-length']);
    if (Number.isFinite(declared) && declared > maxBytes) {
      response.destroy();
      throw failure('URL_IMPORT_TOO_LARGE', 422);
    }
    const encoding = String(response.headers['content-encoding'] || 'identity').trim().toLowerCase();
    if (encoding !== 'identity' && !DECODERS[encoding]) {
      response.destroy();
      throw failure('URL_IMPORT_UNSUPPORTED_CONTENT', 422);
    }
    const body = encoding === 'identity' ? response : pipeline(response, DECODERS[encoding](), () => {});
    const chunks = [];
    let size = 0;
    for await (const chunk of body) {
      size += chunk.length;
      if (size > maxBytes) {
        response.destroy();
        body.destroy();
        throw failure('URL_IMPORT_TOO_LARGE', 422);
      }
      chunks.push(chunk);
    }
    const charset = parameters.map(parameter => parameter.trim().match(/^charset\s*=\s*"?([\w.:-]+)"?$/i)?.[1]).find(Boolean) ?? null;
    return { url: url.href, contentType, charset: charset?.toLowerCase() ?? null, body: Buffer.concat(chunks) };
  }

  // Network details such as resolved addresses never reach the response; only a stable code does.
  translate(error) {
    if (error instanceof AppError) return error;
    if (error?.blockedAddress) return failure('URL_IMPORT_BLOCKED_HOST', 400);
    if (['ENOTFOUND', 'EAI_AGAIN', 'ENODATA'].includes(error?.code)) return failure('URL_IMPORT_HOST_NOT_FOUND', 502);
    // A body that does not decompress (zlib Z_* or Brotli ERR__ERROR_* codes) is not a readable page.
    if (/^(Z_|ERR__ERROR)/.test(String(error?.code))) return failure('URL_IMPORT_UNSUPPORTED_CONTENT', 422);
    return failure('URL_IMPORT_CONNECTION_FAILED', 502);
  }
}
