import { ref } from 'vue';

// Shared state: the navigation entries only flip it, the shell renders the single About dialog.
export const aboutOpen = ref(false);

export const openAbout = () => { aboutOpen.value = true; };
export const closeAbout = () => { aboutOpen.value = false; };

// Version History opens over the About dialog, which stays behind it and takes no key while it is up.
export const versionHistoryOpen = ref(false);

export const openVersionHistory = () => { versionHistoryOpen.value = true; };
export const closeVersionHistory = () => { versionHistoryOpen.value = false; };
