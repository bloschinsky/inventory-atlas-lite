import { ref } from 'vue';

// The initial value is already on <html>: index.html resolves it before the bundle paints.
const STORAGE_KEY = 'inventory-atlas-theme';
export const theme = ref(document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light');

export function setTheme(value) {
  theme.value = value;
  document.documentElement.setAttribute('data-bs-theme', value);
  try {
    localStorage.setItem(STORAGE_KEY, value);
  } catch {
    // A blocked storage only costs the persistence, not the switch itself.
  }
}
