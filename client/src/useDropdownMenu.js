import { nextTick, onBeforeUnmount, ref, watch } from 'vue';

const VIEWPORT_MARGIN = 8;

/*
  A Tabler dropdown menu without Bootstrap's script: the caller renders the menu while `open` is true
  and binds `menuStyle`; this closes it on an outside pointer press and keeps it inside the viewport.
  The menu is aligned to the end of `root`, and moved toward the start only as far as the viewport
  needs, so it is never cut off on a phone wherever the header puts the button. `close()` is for
  Escape: it also returns focus to the toggle.
*/
export function useDropdownMenu() {
  const open = ref(false);
  const root = ref(null);
  const menu = ref(null);
  const toggleButton = ref(null);
  const menuStyle = ref({});

  function place() {
    if (!root.value || !menu.value) return;
    const bounds = root.value.getBoundingClientRect();
    const width = menu.value.offsetWidth;
    const viewport = document.documentElement.clientWidth;
    const left = Math.max(VIEWPORT_MARGIN, Math.min(bounds.right - width, viewport - VIEWPORT_MARGIN - width));
    menuStyle.value = { left: `${left - bounds.left}px`, right: 'auto' };
  }
  const closeOnOutside = event => {
    if (!root.value?.contains(event.target)) open.value = false;
  };
  function stopListening() {
    document.removeEventListener('pointerdown', closeOnOutside);
    window.removeEventListener('resize', place);
  }
  function close() {
    open.value = false;
    toggleButton.value?.focus();
  }
  watch(open, async value => {
    if (!value) return stopListening();
    document.addEventListener('pointerdown', closeOnOutside);
    window.addEventListener('resize', place);
    menuStyle.value = {};
    await nextTick();
    place();
  });
  onBeforeUnmount(stopListening);

  return { open, root, menu, toggleButton, menuStyle, close };
}
