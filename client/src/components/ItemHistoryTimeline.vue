<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconArchive, IconArrowBackUp, IconBox, IconMapPin, IconRestore, IconUserEdit, IconUserShare } from '@tabler/icons-vue';
import { api } from '../api.js';
import { formatDate, formatDateTime } from '../i18n/index.js';

/*
  The activity timeline of one item, newest first. `preview` shows only the most recent changes;
  otherwise the filter and Load more page through the whole history. The events of one action share
  an operation and are shown together as one entry, so a move that changed both the container and
  the location never looks like two separate moves.
*/
const props = defineProps({
  itemId: { type: [Number, String], required: true },
  preview: { type: Boolean, default: false }
});

const { t } = useI18n();
const FILTERS = ['all', 'location', 'transfer'];
const PREVIEW_SIZE = 5;
const PAGE_SIZE = 20;
const ICONS = {
  location_changed: { icon: IconMapPin, color: 'bg-blue-lt' },
  container_changed: { icon: IconBox, color: 'bg-indigo-lt' },
  recipient_changed: { icon: IconUserEdit, color: 'bg-azure-lt' },
  transferred: { icon: IconUserShare, color: 'bg-orange-lt' },
  returned: { icon: IconArrowBackUp, color: 'bg-green-lt' },
  retired: { icon: IconArchive, color: 'bg-secondary-lt' },
  restored: { icon: IconRestore, color: 'bg-teal-lt' }
};

const filter = ref('all');
const events = ref([]);
const nextCursor = ref(null);
const loading = ref(false);
const error = ref('');

async function load(more = false) {
  loading.value = true; error.value = '';
  const query = new URLSearchParams({ type: filter.value, limit: props.preview ? PREVIEW_SIZE : PAGE_SIZE });
  if (more) query.set('cursor', nextCursor.value);
  try {
    const page = await api(`/api/items/${props.itemId}/history?${query}`);
    events.value = more ? [...events.value, ...page.events] : page.events;
    nextCursor.value = page.next_cursor;
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}

// Consecutive events of one operation form one entry; a page boundary inside it is joined again.
const entries = computed(() => events.value.reduce((list, event) => {
  const last = list.at(-1);
  if (last?.operation_id === event.operation_id) last.events.push(event);
  else list.push({ operation_id: event.operation_id, operation_type: event.operation_type, occurred_at: event.occurred_at, events: [event] });
  return list;
}, []));

const viaItem = entry => entry.events.find(event => event.via_item)?.via_item;
const operationLabel = entry => (['bulk_move', 'bulk_replace'].includes(entry.operation_type) ? t(`history.operations.${entry.operation_type}`) : '');
const itemName = reference => (reference.exists ? reference.name : t('history.deletedItem', { name: reference.name }));

function title(event) {
  if (event.type === 'transferred') return t('history.events.transferred', { name: event.to });
  if (event.type === 'returned') return t('history.events.returned', { name: event.from });
  return t(`history.events.${event.type}`);
}

// The before and after values of a change; loans describe their period instead.
function change(event) {
  if (event.type === 'location_changed') return [event.from || t('history.noLocation'), event.to || t('history.noLocation')];
  if (event.type === 'recipient_changed') return [event.from || t('history.nobody'), event.to || t('history.nobody')];
  return null;
}

// The actual length of a closed loan from its stored start and end, in the largest whole unit.
function duration(transfer) {
  const minutes = Math.max(0, Math.floor((Date.parse(transfer.returned_at) - Date.parse(transfer.transferred_at)) / 60000));
  if (minutes < 60) return t('history.duration.minutes', minutes);
  if (minutes < 24 * 60) return t('history.duration.hours', Math.floor(minutes / 60));
  return t('history.duration.days', Math.floor(minutes / (24 * 60)));
}

watch(filter, () => load());
watch(() => props.itemId, () => load());
onMounted(load);
defineExpose({ reload: () => load() });
</script>

<template>
  <div>
    <div
      v-if="!preview"
      class="btn-group mb-3"
      role="group"
      :aria-label="$t('history.filter')"
    >
      <template
        v-for="option in FILTERS"
        :key="option"
      >
        <input
          :id="`history-filter-${option}`"
          v-model="filter"
          type="radio"
          class="btn-check"
          name="history-filter"
          :value="option"
        >
        <label
          class="btn"
          :for="`history-filter-${option}`"
        >{{ $t(`history.filters.${option}`) }}</label>
      </template>
    </div>
    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <p
      v-if="loading && !events.length"
      class="text-secondary d-flex align-items-center gap-2 mb-0"
    >
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      {{ $t('history.loading') }}
    </p>
    <p
      v-else-if="!events.length && !error"
      class="text-secondary mb-0"
    >
      {{ filter === 'all' ? $t('history.empty') : $t('history.emptyFiltered') }}
    </p>
    <ul
      v-else
      class="timeline app-history"
      :aria-label="$t('history.title')"
    >
      <li
        v-for="entry in entries"
        :key="entry.events[0].id"
        class="timeline-event"
      >
        <div
          class="timeline-event-icon"
          :class="ICONS[entry.events[0].type].color"
        >
          <component
            :is="ICONS[entry.events[0].type].icon"
            :size="18"
            aria-hidden="true"
          />
        </div>
        <div class="card timeline-event-card">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between gap-1 mb-1">
              <time
                class="meta-text"
                :datetime="entry.occurred_at"
              >{{ formatDateTime(entry.occurred_at) }}</time>
              <span
                v-if="operationLabel(entry)"
                class="badge bg-secondary-lt"
              >{{ operationLabel(entry) }}</span>
            </div>
            <div
              v-for="event in entry.events"
              :key="event.id"
              class="app-history-event"
            >
              <h3 class="h4 mb-1 text-break">
                {{ title(event) }}
              </h3>
              <p
                v-if="change(event)"
                class="mb-1 text-break"
              >
                {{ change(event)[0] }} → {{ change(event)[1] }}
              </p>
              <p
                v-else-if="event.type === 'container_changed'"
                class="mb-1 text-break"
              >
                <component
                  :is="event.from_item?.exists ? 'RouterLink' : 'span'"
                  :to="event.from_item?.exists ? `/items/${event.from_item.id}` : undefined"
                >
                  {{ event.from_item ? itemName(event.from_item) : $t('history.topLevel') }}
                </component>
                →
                <component
                  :is="event.to_item?.exists ? 'RouterLink' : 'span'"
                  :to="event.to_item?.exists ? `/items/${event.to_item.id}` : undefined"
                >
                  {{ event.to_item ? itemName(event.to_item) : $t('history.topLevel') }}
                </component>
              </p>
              <template v-if="event.transfer">
                <p
                  v-if="event.type === 'transferred' && event.transfer.expected_return_on"
                  class="meta-text mb-1"
                >
                  {{ $t('history.expectedReturn', { date: formatDate(event.transfer.expected_return_on) }) }}
                </p>
                <p
                  v-if="event.type === 'transferred' && !event.transfer.returned_at"
                  class="mb-1"
                >
                  <span class="badge bg-orange-lt">{{ $t('history.stillOnLoan') }}</span>
                </p>
                <p
                  v-if="event.type === 'returned'"
                  class="meta-text mb-1"
                >
                  {{ $t('history.returnedAfter', { duration: duration(event.transfer) }) }}
                </p>
                <p
                  v-if="event.type === 'transferred' ? event.transfer.note : event.transfer.return_note"
                  class="text-secondary mb-1 text-break app-history-note"
                >
                  {{ event.type === 'transferred' ? event.transfer.note : event.transfer.return_note }}
                </p>
              </template>
            </div>
            <p
              v-if="viaItem(entry)"
              class="meta-text mb-0 text-break"
            >
              <i18n-t
                keypath="history.movedWith"
                scope="global"
              >
                <template #name>
                  <RouterLink
                    v-if="viaItem(entry).exists"
                    :to="`/items/${viaItem(entry).id}`"
                  >
                    {{ viaItem(entry).name }}
                  </RouterLink>
                  <template v-else>
                    {{ itemName(viaItem(entry)) }}
                  </template>
                </template>
              </i18n-t>
            </p>
          </div>
        </div>
      </li>
    </ul>
    <div
      v-if="!preview && nextCursor"
      class="text-center mt-3"
    >
      <button
        type="button"
        class="btn"
        :disabled="loading"
        @click="load(true)"
      >
        {{ $t('history.loadMore') }}
      </button>
    </div>
    <p
      v-if="!preview && !nextCursor && !loading && !error"
      class="meta-text mt-3 mb-0"
    >
      {{ $t('history.trackingNote') }}
    </p>
  </div>
</template>
