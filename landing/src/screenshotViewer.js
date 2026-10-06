import { provide, ref } from 'vue';

/*
  Gives the screenshots of a page their viewer: `viewer` is the ref for the page's
  <ScreenshotLightbox>, and `openScreenshot(gallery, index, event)` is provided to every screenshot
  link below the page and returned for the page's own links. A modified click (new tab, new window,
  download) keeps the plain link to the full-size file, as without the page script.
*/
export function provideScreenshotViewer() {
  const viewer = ref(null);
  const openScreenshot = (gallery, index, event) => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    viewer.value.open(gallery, index, event.currentTarget);
  };
  provide('openScreenshot', openScreenshot);
  return { viewer, openScreenshot };
}
