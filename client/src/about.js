import { ref } from 'vue';

// Shared state: the navigation entries only flip it, the shell renders the single About dialog.
export const aboutOpen = ref(false);

export const openAbout = () => { aboutOpen.value = true; };
export const closeAbout = () => { aboutOpen.value = false; };
