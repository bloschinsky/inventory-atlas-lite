import net from 'node:net';
import { AppError } from '../../../shared/appError.js';

/*
  Which network destinations a user-supplied address may reach. The app is usually self-hosted on a
  home network, so fetching a product page must never become a way to reach that network: only
  public unicast addresses are allowed, and everything private, local, shared, reserved, or used for
  documentation is refused. IPv6 is allowed only inside the global unicast range 2000::/3, which
  leaves out loopback, unspecified, ULA, link-local, multicast, IPv4-mapped and IPv4-compatible
  addresses, and NAT64; the ranges inside 2000::/3 that embed or tunnel IPv4 are refused as well.
*/
const BLOCKED_IPV4 = [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16], ['172.16.0.0', 12],
  ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.88.99.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
];
const BLOCKED_IPV6 = [['2001::', 32], ['2001:db8::', 32], ['2001:10::', 28], ['2001:20::', 28], ['2002::', 16], ['3fff::', 20]];

const blocked = new net.BlockList();
for (const [address, prefix] of BLOCKED_IPV4) blocked.addSubnet(address, prefix, 'ipv4');
for (const [address, prefix] of BLOCKED_IPV6) blocked.addSubnet(address, prefix, 'ipv6');
const globalUnicast = new net.BlockList();
globalUnicast.addSubnet('2000::', 3, 'ipv6');

export function isPublicAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  if (family === 6) return globalUnicast.check(address, 'ipv6') && !blocked.check(address, 'ipv6');
  return false;
}

// Names that only ever mean this machine or the local network, whatever a resolver answers for them.
const LOCAL_SUFFIXES = ['localhost', 'local', 'internal', 'intranet', 'lan', 'home', 'corp', 'home.arpa', 'localdomain'];

const refuse = code => new AppError(code, {}, 400);
const MAX_URL_LENGTH = 2048;

/*
  Reads a user-supplied page or image address. WHATWG URL parsing already turns unusual IPv4
  spellings (hexadecimal, octal, single-number) into their dotted form, so an IP literal is checked
  exactly as it will be connected to. A host name must look like a public DNS name: at least two
  labels and no local-only suffix. Its resolved addresses are checked again at connection time.
*/
export function readPublicUrl(raw, isAllowedAddress = isPublicAddress) {
  if (typeof raw !== 'string' || !raw.trim()) throw refuse('URL_IMPORT_URL_REQUIRED');
  const text = raw.trim();
  if (text.length > MAX_URL_LENGTH) throw refuse('URL_IMPORT_INVALID_URL');
  let url;
  try {
    url = new URL(text);
  } catch {
    throw refuse('URL_IMPORT_INVALID_URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw refuse('URL_IMPORT_UNSUPPORTED_PROTOCOL');
  if (url.username || url.password) throw refuse('URL_IMPORT_URL_CREDENTIALS');
  const host = hostOf(url);
  if (net.isIP(host)) {
    if (!isAllowedAddress(host)) throw refuse('URL_IMPORT_BLOCKED_HOST');
  } else if (!isPublicHostName(host)) {
    throw refuse('URL_IMPORT_BLOCKED_HOST');
  }
  url.hash = '';
  return url;
}

// The host as it is connected to: without the brackets of an IPv6 literal and without a trailing dot.
export const hostOf = url => url.hostname.replace(/^\[(.*)\]$/, '$1').replace(/\.$/, '').toLowerCase();

function isPublicHostName(host) {
  const labels = host.split('.');
  if (labels.length < 2 || host.length > 253) return false;
  if (!labels.every(label => /^[a-z0-9_](?:[a-z0-9_-]{0,61}[a-z0-9_])?$/.test(label))) return false;
  // A purely numeric last label would be an IP address the URL parser did not accept.
  if (/^\d+$/.test(labels.at(-1))) return false;
  return !LOCAL_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}
