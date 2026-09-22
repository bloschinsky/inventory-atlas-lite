/*
  Canonical QR payload for an item. It carries nothing but the item's own UUID, so a printed code
  keeps working after the deployment moves to another host, port, domain, or backup restore.
*/

export const ITEM_QR_PREFIX = 'ial:item';
export const ITEM_QR_VERSION = 'v1';

// The canonical lowercase UUID form the item repository stores; anything else is not one of ours.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

const text = value => typeof value === 'string' ? value.trim() : '';

// Builds ial:item:v1:<uuid>. Case is normalized so the same item always produces the same code.
export function encodeItemQrPayload(uuid) {
  const normalized = text(uuid).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`Invalid item UUID: ${JSON.stringify(uuid)}.`);
  return `${ITEM_QR_PREFIX}:${ITEM_QR_VERSION}:${normalized}`;
}

// Reads a scanned value and returns the item UUID, rejecting anything that is not exactly our format.
export function decodeItemQrPayload(value) {
  const parts = text(value).split(':');
  if (parts.length !== 4 || `${parts[0]}:${parts[1]}` !== ITEM_QR_PREFIX) {
    throw new Error('This code is not an Inventory Atlas item code.');
  }
  if (parts[2] !== ITEM_QR_VERSION) throw new Error(`Unsupported item code version: ${JSON.stringify(parts[2])}.`);
  if (!UUID_PATTERN.test(parts[3])) throw new Error('The item code does not contain a valid UUID.');
  return parts[3];
}
