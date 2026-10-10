<script setup>
import { provide, shallowReactive } from 'vue';
import { START_LOCATION, routeLocationKey } from 'vue-router';

/*
  The page area. Pages read their address through useRoute(), so they get the route shown here: under
  the Settings dialog that is still the covered page's route, which keeps its filters and data as they were.
*/
const props = defineProps({ route: { type: Object, required: true } });

const shownRoute = {};
for (const key in START_LOCATION) Object.defineProperty(shownRoute, key, { get: () => props.route[key], enumerable: true });
provide(routeLocationKey, shallowReactive(shownRoute));
</script>

<template>
  <RouterView :route="route" />
</template>
