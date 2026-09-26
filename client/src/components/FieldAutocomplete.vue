<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { api } from '../api.js';
import { formatNumber } from '../i18n/index.js';

// `source` is the suggestions endpoint; it answers `?search=&limit=` with `[{ value, usage_count }]`.
// `showCounts` also shows how many items use each suggested value.
const props = defineProps({
  modelValue: { type: String, default: '' },
  source: { type: String, required: true },
  inputId: { type: String, required: true },
  showCounts: { type: Boolean, default: false }
});
const emit = defineEmits(['update:modelValue']);
// Attributes such as `maxlength` and `placeholder` belong on the input, not on the wrapper.
defineOptions({ inheritAttrs: false });

const root = ref(null);
const suggestions = ref([]);
const open = ref(false);
const highlighted = ref(-1);
let timer = null;
let latestRequest = 0;

// A value the user already typed in full is not worth suggesting back to them.
const visible = computed(() => suggestions.value.filter(s => s.value.toLowerCase() !== props.modelValue.trim().toLowerCase()));
const listId = computed(() => `${props.inputId}-suggestions`);
const activeId = computed(() => (highlighted.value >= 0 ? `${listId.value}-${highlighted.value}` : undefined));

async function load(search) {
  const request = ++latestRequest;
  const query = new URLSearchParams({ search, limit: '10' });
  try {
    const result = await api(`${props.source}?${query}`);
    // Stale responses must never overwrite the result of a newer search.
    if (request !== latestRequest) return;
    suggestions.value = result;
  } catch {
    // Suggestions are a helper only: on failure the control stays a plain text input.
    if (request === latestRequest) suggestions.value = [];
  }
  highlighted.value = -1;
}

function schedule(search) {
  clearTimeout(timer);
  timer = setTimeout(() => load(search), 200);
}
onBeforeUnmount(() => clearTimeout(timer));

function close() {
  open.value = false;
  highlighted.value = -1;
}
function onFocus() {
  open.value = true;
  load(props.modelValue.trim());
}
function onInput(event) {
  emit('update:modelValue', event.target.value);
  open.value = true;
  schedule(event.target.value.trim());
}
function select(suggestion) {
  emit('update:modelValue', suggestion.value);
  close();
}
// Highlighting cycles through the suggestions and back to "nothing highlighted".
function move(step) {
  if (!open.value || !visible.value.length) return;
  const stops = visible.value.length + 1;
  highlighted.value = (highlighted.value + 1 + step + stops) % stops - 1;
}
function onEnter(event) {
  // Enter only selects while a suggestion is highlighted; otherwise the form submits as usual.
  if (!open.value || highlighted.value < 0) return;
  event.preventDefault();
  select(visible.value[highlighted.value]);
}
function onFocusOut(event) {
  if (!root.value?.contains(event.relatedTarget)) close();
}
</script>

<template>
  <div
    ref="root"
    class="position-relative"
    @focusout="onFocusOut"
  >
    <input
      v-bind="$attrs"
      :id="inputId"
      class="form-control"
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      :aria-expanded="open && visible.length ? 'true' : 'false'"
      :aria-controls="listId"
      :aria-activedescendant="activeId"
      :value="modelValue"
      @focus="onFocus"
      @input="onInput"
      @keydown.down.prevent="move(1)"
      @keydown.up.prevent="move(-1)"
      @keydown.enter="onEnter"
      @keydown.esc="close"
    >
    <ul
      v-if="open && visible.length"
      :id="listId"
      class="dropdown-menu show w-100 shadow-sm suggestion-list"
      role="listbox"
    >
      <li
        v-for="(suggestion, index) in visible"
        :id="`${listId}-${index}`"
        :key="suggestion.value"
        class="dropdown-item"
        role="option"
        :class="{ active: index === highlighted }"
        :aria-selected="index === highlighted"
        @mousedown.prevent="select(suggestion)"
      >
        {{ suggestion.value }}
        <span
          v-if="showCounts"
          class="badge bg-secondary-lt float-end ms-2"
        >{{ formatNumber(suggestion.usage_count) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.suggestion-list { max-height: 14rem; overflow-y: auto; }
.suggestion-list .dropdown-item { cursor: pointer; }
</style>
