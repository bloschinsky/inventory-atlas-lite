import { COLOR_PRESETS, CUSTOM_COLOR, readColor } from '../../shared/colors.js';

/*
  The interface face of the Color custom field. A preset is named by its translation, a custom color
  by "Custom" (its HEX is shown beside it where there is room); the swatch never carries the meaning alone.
*/
export { COLOR_PRESETS, CUSTOM_COLOR };

export const colorLabelKey = key => (key === CUSTOM_COLOR ? 'colors.custom' : `colors.presets.${key}`);

// The stored text of a color field as { key, hex }, or null when it is empty or not a valid color.
export const storedColor = value => (value ? readColor(value) : null);

// A checkmark drawn on a swatch stays readable: dark on light colors, white on dark ones.
export const contrastColor = hex => {
  const [r, g, b] = [1, 3, 5].map(start => Number.parseInt(hex.slice(start, start + 2), 16));
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? '#171717' : '#FFFFFF';
};
