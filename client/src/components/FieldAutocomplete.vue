<script setup>
import { computed, onBeforeUnmount, ref, watch } from 'vue';
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

// The list is at most this tall, and opens above the field when less than `MIN_BELOW` fits below it.
const LIST_HEIGHT = 224;
const MIN_BELOW = 160;
const GAP = 8;

const root = ref(null);
const input = ref(null);
const suggestions = ref([]);
const open = ref(false);
const highlighted = ref(-1);
const placement = ref({ above: false, maxHeight: LIST_HEIGHT });
let timer = null;
let latestRequest = 0;
// A finger or mouse is pressed on the list: losing focus now must not close it before the tap lands.
let pressingList = false;

// A form may still hold null for a value that was never set.
const typed = computed(() => (props.modelValue || '').trim());
// A value the user already typed in full is not worth suggesting back to them.
const visible = computed(() => suggestions.value.filter(s => s.value.toLowerCase() !== typed.value.toLowerCase()));
const shown = computed(() => open.value && visible.value.length > 0);
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
  // Typing already cleared the highlight; an answer arriving after an arrow key must not undo the key.
  if (highlighted.value >= visible.value.length) highlighted.value = -1;
}

function schedule(search) {
  clearTimeout(timer);
  timer = setTimeout(() => load(search), 200);
}

/*
  Fits the list into the part of the page the user can actually see. On a phone the software keyboard
  shrinks the visual viewport, not the layout one, so a list below the field would open behind the
  keyboard; it then opens above the field instead, below the sticky top bar, and is never taller than
  the room it has. Its own scrolling still reaches every suggestion.
*/
function place() {
  if (!input.value) return;
  const viewport = window.visualViewport;
  const field = input.value.getBoundingClientRect();
  const header = document.querySelector('header.sticky-top')?.getBoundingClientRect().bottom || 0;
  const top = Math.max(viewport ? viewport.offsetTop : 0, header);
  const bottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const below = bottom - field.bottom - GAP;
  const above = field.top - top - GAP;
  const up = below < MIN_BELOW && above > below;
  placement.value = { above: up, maxHeight: Math.max(96, Math.min(LIST_HEIGHT, up ? above : below)) };
}

function close() {
  open.value = false;
  highlighted.value = -1;
  pressingList = false;
}
// While the list is open, a tap or focus anywhere else closes it, even after the field itself has
// already lost focus to a scroll of the list.
function onOutside(event) {
  if (!root.value?.contains(event.target)) close();
}
const listeners = [
  [document, 'pointerdown', onOutside],
  [document, 'focusin', onOutside],
  [window, 'resize', place],
  [window, 'scroll', place],
  [window.visualViewport, 'resize', place],
  [window.visualViewport, 'scroll', place]
];
const listen = on => {
  for (const [target, type, handler] of listeners) target?.[on ? 'addEventListener' : 'removeEventListener'](type, handler, true);
};
watch(shown, value => {
  listen(value);
  if (value) place();
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  listen(false);
});

function onFocus() {
  pressingList = false;
  open.value = true;
  highlighted.value = -1;
  load(typed.value);
}
function onInput(event) {
  emit('update:modelValue', event.target.value);
  open.value = true;
  highlighted.value = -1;
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
  if (!pressingList && !root.value?.contains(event.relatedTarget)) close();
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
      ref="input"
      class="form-control"
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      :aria-expanded="shown ? 'true' : 'false'"
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
    <!--
      A suggestion is chosen on click, which mouse, touch, and pen all produce once the press ends, so
      a finger that scrolls the list chooses nothing. Preventing mousedown keeps the focus in the field
      for the mouse; a touch press is only remembered, so the list survives the field losing focus and
      still scrolls natively.
    -->
    <ul
      v-if="shown"
      :id="listId"
      class="dropdown-menu show w-100 shadow-sm suggestion-list"
      :class="{ 'suggestion-list-above': placement.above }"
      :style="{ maxHeight: `${placement.maxHeight}px` }"
      role="listbox"
      @pointerdown="pressingList = true"
      @mousedown.prevent
    >
      <li
        v-for="(suggestion, index) in visible"
        :id="`${listId}-${index}`"
        :key="suggestion.value"
        class="dropdown-item"
        role="option"
        :class="{ active: index === highlighted }"
        :aria-selected="index === highlighted"
        @click="select(suggestion)"
      >
        <span class="suggestion-value">{{ suggestion.value }}</span>
        <span
          v-if="showCounts"
          class="badge bg-secondary-lt ms-2"
        >{{ formatNumber(suggestion.usage_count) }}</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.suggestion-list { overflow-y: auto; overscroll-behavior: contain; touch-action: pan-y; }
.suggestion-list-above { top: auto; bottom: 100%; margin-bottom: 0.125rem; }
.suggestion-list .dropdown-item { display: flex; align-items: center; justify-content: space-between; cursor: pointer; white-space: normal; overflow-wrap: anywhere; }
.suggestion-value { min-width: 0; }
/* A finger needs a taller target than a mouse pointer. */
@media (pointer: coarse) {
  .suggestion-list .dropdown-item { min-height: 2.75rem; }
}
</style>
