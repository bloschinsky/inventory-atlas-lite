import { AppError } from './appError.js';

/*
  The AI provider presets offered in Settings, shared by the client and the server so both agree on
  identifiers, default base URLs, and whether an API key is required. Their help texts are
  translated in the client locales under settings.ai.providers.<id>. Every preset speaks the
  OpenAI-style HTTP API; only OpenAI itself uses its native Responses endpoint.
*/
export const AI_PROVIDERS = [
  {
    id: 'openai',
    label: 'OpenAI',
    defaultBaseUrl: 'https://api.openai.com/v1',
    apiKeyRequired: true
  },
  {
    id: 'openrouter',
    label: 'OpenRouter',
    defaultBaseUrl: 'https://openrouter.ai/api/v1',
    apiKeyRequired: true
  },
  {
    id: 'ollama',
    label: 'Ollama',
    defaultBaseUrl: 'http://localhost:11434/v1',
    apiKeyRequired: false
  },
  {
    id: 'lmstudio',
    label: 'LM Studio',
    defaultBaseUrl: 'http://localhost:1234/v1',
    apiKeyRequired: false
  },
  {
    id: 'custom',
    label: 'Custom OpenAI-compatible',
    defaultBaseUrl: '',
    apiKeyRequired: false
  }
];

export const DEFAULT_AI_PROVIDER = 'openai';
export const MAX_AI_MODEL_LENGTH = 200;
export const MAX_AI_DISPLAY_NAME_LENGTH = 60;
const MAX_BASE_URL_LENGTH = 500;
// Whether the configured model accepts images: detected from provider metadata, or set by the user.
export const IMAGE_INPUT_OPTIONS = ['auto', 'supported', 'unsupported'];

export const aiProvider = id => AI_PROVIDERS.find(provider => provider.id === id) || null;

// Loopback, private, link-local, and .local/.lan names: where plain http:// is expected.
export function isLocalNetworkHost(hostname) {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.lan') ||
      host.endsWith('.internal') || host.endsWith('.ts.net') || !host.includes('.') && !host.includes(':')) return true;
  if (host.includes(':')) return host === '::1' || /^(fc|fd|fe80:)/.test(host);
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some(octet => !Number.isInteger(octet) || octet < 0 || octet > 255)) return false;
  const [a, b] = octets;
  return a === 127 || a === 10 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 169 && b === 254) || (a === 100 && b >= 64 && b <= 127);
}

/*
  Returns the canonical base URL, without a trailing slash, or throws an AppError the API answers with
  as a 400. Only the scheme, host, port, and path are accepted: credentials, a query, or a
  fragment would be silently carried into every provider request.
*/
export function normalizeBaseUrl(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  if (!text) throw new AppError('BASE_URL_REQUIRED');
  if (text.length > MAX_BASE_URL_LENGTH) throw new AppError('BASE_URL_TOO_LONG', { max: MAX_BASE_URL_LENGTH });
  let url;
  try { url = new globalThis.URL(text); } catch { throw new AppError('BASE_URL_INVALID'); }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new AppError('BASE_URL_PROTOCOL');
  if (url.username || url.password) throw new AppError('BASE_URL_CREDENTIALS');
  if (url.search || url.hash || text.includes('?') || text.includes('#')) throw new AppError('BASE_URL_QUERY');
  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`;
}
