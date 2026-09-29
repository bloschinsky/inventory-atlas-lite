<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { IconArrowDown, IconArrowUp, IconX } from '@tabler/icons-vue';
import { api } from '../api.js';
import ItemThumbnail from './ItemThumbnail.vue';

/*
  Edits the ordered membership of a checklist. Items are found with the regular item search and added
  one after another without leaving the form; the list below keeps the user's order, which only the
  move buttons change. An item already in the list cannot be added twice. Nothing is created here.
*/
const entries = defineModel({ type: Array, required: true });

const search = ref('');
const results = ref([]);
const searching = ref(false);
const error = ref('');
let timer;
let request = 0;

const entryKey = entry => entry.id ?? `item-${entry.item_id}`;
const isAdded = item => entries.value.some(entry => entry.item_id === item.id);
const context = item => [item.category_name, item.effective_location, item.parent_name].filter(Boolean).join(' · ');

async function find() {
  const current = ++request;
  searching.value = true; error.value = '';
  try {
    const query = new URLSearchParams({ search: search.value.trim(), pageSize: '20' });
    const { items } = await api(`/api/items?${query}`);
    // A slower answer to an earlier search never replaces the newer one.
    if (current === request) results.value = items;
  } catch (e) {
    if (current === request) error.value = e.message;
  } finally {
    if (current === request) searching.value = false;
  }
}
watch(search, () => {
  clearTimeout(timer);
  timer = setTimeout(find, 250);
});

function add(item) {
  if (isAdded(item)) return;
  entries.value = [...entries.value, {
    id: null,
    item_id: item.id,
    name: item.name,
    deleted: false,
    category_name: item.category_name,
    effective_location: item.effective_location,
    thumbnail_id: item.thumbnail_id
  }];
}

// The moved button keeps the keyboard focus, so repeated presses keep moving the same entry.
async function move(index, step) {
  const list = [...entries.value];
  const [entry] = list.splice(index, 1);
  list.splice(index + step, 0, entry);
  entries.value = list;
  await nextTick();
  const target = document.getElementById(`checklist-entry-${entryKey(entry)}-${step < 0 ? 'up' : 'down'}`);
  (target && !target.disabled ? target : document.getElementById(`checklist-entry-${entryKey(entry)}-remove`))?.focus();
}

function remove(index) {
  entries.value = entries.value.filter((_entry, position) => position !== index);
}

onMounted(find);
onBeforeUnmount(() => clearTimeout(timer));
</script>

<template>
  <div>
    <label
      class="form-label"
      for="checklist-item-search"
    >{{ $t('checklists.picker.search') }}</label>
    <input
      id="checklist-item-search"
      v-model="search"
      type="search"
      class="form-control"
      :placeholder="$t('checklists.picker.placeholder')"
      autocomplete="off"
    >
    <div
      v-if="error"
      class="text-danger small mt-1"
      role="alert"
    >
      {{ error }}
    </div>
    <div
      class="list-group checklist-picker-results mt-2"
      :aria-busy="searching"
    >
      <div
        v-for="item in results"
        :key="item.id"
        class="list-group-item d-flex align-items-center gap-2"
      >
        <ItemThumbnail
          :photo-id="item.thumbnail_id"
          :name="item.name"
        />
        <div class="min-w-0 flex-fill">
          <div class="text-break">
            {{ item.name }}
          </div>
          <div class="meta-text">
            {{ context(item) }}
          </div>
        </div>
        <button
          type="button"
          class="btn btn-sm checklist-touch"
          :disabled="isAdded(item)"
          :aria-label="$t('checklists.picker.addNamed', { name: item.name })"
          @click="add(item)"
        >
          {{ isAdded(item) ? $t('checklists.picker.added') : $t('common.add') }}
        </button>
      </div>
      <div
        v-if="!searching && !results.length"
        class="list-group-item text-secondary"
      >
        {{ $t('checklists.picker.noResults') }}
      </div>
    </div>

    <h3
      id="checklist-selected-items"
      class="h4 mt-4 mb-2"
    >
      {{ $t('checklists.picker.selected') }}
      <span class="meta-text fw-normal">{{ $t('counts.items', entries.length) }}</span>
    </h3>
    <p
      v-if="!entries.length"
      class="text-secondary"
    >
      {{ $t('checklists.picker.empty') }}
    </p>
    <ol
      v-else
      class="list-group"
      aria-labelledby="checklist-selected-items"
    >
      <li
        v-for="(entry, index) in entries"
        :key="entryKey(entry)"
        class="list-group-item d-flex flex-wrap align-items-center gap-2"
      >
        <span
          class="text-secondary checklist-position"
          aria-hidden="true"
        >{{ index + 1 }}</span>
        <div class="min-w-0 flex-fill">
          <div
            class="text-break"
            :class="{ 'text-secondary': entry.deleted }"
          >
            {{ entry.name }}
          </div>
          <div class="meta-text">
            <template v-if="entry.deleted">
              <span class="badge bg-warning-lt">{{ $t('checklists.deletedItem') }}</span>
              {{ $t('checklists.deletedItemHelp') }}
            </template>
            <template v-else>
              {{ [entry.category_name, entry.effective_location].filter(Boolean).join(' · ') }}
            </template>
          </div>
        </div>
        <div class="btn-list flex-nowrap">
          <button
            :id="`checklist-entry-${entryKey(entry)}-up`"
            type="button"
            class="btn btn-icon checklist-touch"
            :disabled="index === 0"
            :aria-label="$t('checklists.picker.moveUp', { name: entry.name })"
            @click="move(index, -1)"
          >
            <IconArrowUp
              :size="18"
              aria-hidden="true"
            />
          </button>
          <button
            :id="`checklist-entry-${entryKey(entry)}-down`"
            type="button"
            class="btn btn-icon checklist-touch"
            :disabled="index === entries.length - 1"
            :aria-label="$t('checklists.picker.moveDown', { name: entry.name })"
            @click="move(index, 1)"
          >
            <IconArrowDown
              :size="18"
              aria-hidden="true"
            />
          </button>
          <button
            :id="`checklist-entry-${entryKey(entry)}-remove`"
            type="button"
            class="btn btn-icon btn-outline-danger checklist-touch"
            :aria-label="$t('checklists.picker.removeNamed', { name: entry.name })"
            @click="remove(index)"
          >
            <IconX
              :size="18"
              aria-hidden="true"
            />
          </button>
        </div>
      </li>
    </ol>
  </div>
</template>
