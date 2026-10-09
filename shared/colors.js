/*
  The Color custom field type, shared by the client and the server. A value names a semantic color
  group (`key`) and the exact color (`hex`). The twelve presets are fixed groups with one canonical
  HEX each; `custom` keeps any exact HEX the user chose and is never reclassified into a preset. The
  interface names each group through colors.presets.<key> or colors.custom. The position in this list
  is the semantic sort order; Custom comes after every preset.
*/
export const COLOR_PRESETS = [
  { key: 'black', hex: '#171717' },
  { key: 'white', hex: '#FFFFFF' },
  { key: 'gray', hex: '#858585' },
  { key: 'brown', hex: '#795548' },
  { key: 'beige', hex: '#D8C5A3' },
  { key: 'red', hex: '#DC3545' },
  { key: 'orange', hex: '#F07830' },
  { key: 'yellow', hex: '#F5C542' },
  { key: 'green', hex: '#2E9958' },
  { key: 'blue', hex: '#2878D0' },
  { key: 'purple', hex: '#8755BF' },
  { key: 'pink', hex: '#E886B2' }
];

export const CUSTOM_COLOR = 'custom';

// Every stored group key in sort order: the presets, then Custom.
export const COLOR_KEYS = [...COLOR_PRESETS.map(preset => preset.key), CUSTOM_COLOR];

const presetHex = new Map(COLOR_PRESETS.map(preset => [preset.key, preset.hex]));
const colorProperties = ['key', 'hex'];

// "#a08c75" becomes "#A08C75"; anything that is not a six-digit #RRGGBB color is null.
export const normalizeHex = value => (typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value.trim())
  ? value.trim().toUpperCase() : null);

/*
  Reads a color from its object form or from its serialized JSON text. Exactly `key` and `hex` are
  allowed; a preset must carry its own canonical HEX, so {"key":"red","hex":"#000000"} is refused.
  Returns the normalized { key, hex }, or null for anything that is not a valid color.
*/
export function readColor(raw) {
  let value = raw;
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const properties = Object.keys(value);
  if (properties.length !== colorProperties.length || !colorProperties.every(property => properties.includes(property))) return null;
  const hex = normalizeHex(value.hex);
  if (!hex || !COLOR_KEYS.includes(value.key)) return null;
  if (value.key !== CUSTOM_COLOR && presetHex.get(value.key) !== hex) return null;
  return { key: value.key, hex };
}

// The canonical stored text of a color: compact JSON with `key` first.
export const encodeColor = ({ key, hex }) => JSON.stringify({ key, hex });

export const presetColor = key => ({ key, hex: presetHex.get(key) });

export const customColor = hex => ({ key: CUSTOM_COLOR, hex: normalizeHex(hex) });
