<script setup>
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { loadApexCharts } from '../dashboardCharts.js';

/*
  One ApexCharts instance for the lifetime of the component. New options (fresh data, another
  language, or a theme switch) update that instance in place; ApexCharts follows the container's
  width itself, and the instance is destroyed with the component, so a refresh never stacks charts.
*/
const props = defineProps({
  options: { type: Object, required: true },
  label: { type: String, required: true }
});

const element = ref(null);
let chart = null;
let ready = false;
let unmounted = false;

onMounted(async () => {
  const ApexCharts = await loadApexCharts();
  if (unmounted) return;
  const rendered = props.options;
  chart = new ApexCharts(element.value, rendered);
  await chart.render();
  ready = true;
  // Options that arrived while the first render was running are applied at once.
  if (!unmounted && props.options !== rendered) chart.updateOptions(props.options, true, false);
});

watch(() => props.options, options => {
  if (ready && !unmounted) chart.updateOptions(options, true, false);
});

onBeforeUnmount(() => {
  unmounted = true;
  ready = false;
  chart?.destroy();
  chart = null;
});
</script>

<template>
  <div
    ref="element"
    class="dashboard-chart"
    role="img"
    :aria-label="label"
  />
</template>
