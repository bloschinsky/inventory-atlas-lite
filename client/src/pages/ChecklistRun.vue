<script setup>
import { computed, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IconExternalLink } from '@tabler/icons-vue';
import { api, jsonOptions } from '../api.js';
import { formatDateTime } from '../i18n/index.js';
import { MAX_RUN_ITEM_NOTE } from '../../../shared/checklists.js';
import { modeKey, stateBadge, stateKey } from '../checklists.js';
import PageHeader from '../components/PageHeader.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';

/*
  One checklist run. Every state change and note is saved at once, so a reload never loses progress,
  and the server's answer replaces the whole run. A completed run is shown read-only.
*/
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const run = ref(null);
const notes = ref({});
const busy = ref(null);
const completing = ref(false);
const starting = ref(false);
const error = ref('');

// The quick actions in the order they are most often needed: found, not found, undo.
const actions = ['confirmed', 'missing', 'pending'];
const open = computed(() => run.value?.status === 'in_progress');
const subtitle = computed(() => run.value && `${t(modeKey(run.value.mode))} · ${t('checklists.run.startedAt', { date: formatDateTime(run.value.started_at) })}`);
const percent = status => (run.value.counts.total ? (run.value.counts[status] / run.value.counts.total) * 100 : 0);

function show(next) {
  run.value = next;
  notes.value = Object.fromEntries(next.items.map(item => [item.id, item.note ?? '']));
}

async function load() {
  error.value = '';
  try { show(await api(`/api/checklist-runs/${route.params.runId}`)); } catch (e) { error.value = e.message; }
}

async function update(item, change) {
  busy.value = item.id; error.value = '';
  try {
    const next = await api(`/api/checklist-runs/${run.value.id}/items/${item.id}`, jsonOptions('PATCH', change));
    // A note typed in another row while this request ran is kept.
    const drafts = notes.value;
    show(next);
    if (!('note' in change)) notes.value = { ...notes.value, ...drafts };
  } catch (e) { error.value = e.message; } finally { busy.value = null; }
}

function saveNote(item) {
  const note = notes.value[item.id];
  if (note.trim() === (item.note ?? '')) return;
  update(item, { note });
}

async function complete() {
  const { pending } = run.value.counts;
  if (pending && !confirm(t('checklists.run.confirmPending', pending))) return;
  completing.value = true; error.value = '';
  try { show(await api(`/api/checklist-runs/${run.value.id}/complete`, { method: 'POST' })); } catch (e) { error.value = e.message; } finally { completing.value = false; }
}

// Running again always creates a new run; this one stays exactly as it is.
async function runAgain() {
  starting.value = true; error.value = '';
  try {
    const next = await api(`/api/checklists/${run.value.checklist_id}/runs`, { method: 'POST' });
    router.push(`/checklists/runs/${next.id}`);
  } catch (e) { error.value = e.message; } finally { starting.value = false; }
}

watch(() => route.params.runId, runId => { if (runId) load(); }, { immediate: true });
</script>

<template>
  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    {{ error }}
  </div>
  <div
    v-if="!run && !error"
    class="card"
  >
    <div class="card-body d-flex align-items-center gap-2 text-secondary">
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      {{ $t('checklists.run.loading') }}
    </div>
  </div>
  <template v-if="run">
    <PageHeader
      :title="run.checklist_name"
      :subtitle="subtitle"
    >
      <template #actions>
        <RouterLink
          v-if="run.checklist_id"
          :to="`/checklists/${run.checklist_id}`"
          class="btn"
        >
          {{ $t('checklists.run.backToChecklist') }}
        </RouterLink>
        <RouterLink
          v-else
          to="/checklists"
          class="btn"
        >
          {{ $t('checklists.run.allChecklists') }}
        </RouterLink>
        <button
          v-if="!open && run.checklist_id"
          type="button"
          class="btn btn-primary"
          :disabled="starting"
          @click="runAgain"
        >
          {{ $t('checklists.runAgain') }}
        </button>
      </template>
    </PageHeader>

    <div
      v-if="!run.checklist_id"
      class="alert alert-warning"
      role="status"
    >
      {{ $t('checklists.run.checklistDeleted') }}
    </div>
    <div
      v-if="!open"
      class="alert alert-info"
      role="status"
    >
      {{ $t('checklists.run.completedNotice') }}
      {{ $t('checklists.run.completedAt', { date: formatDateTime(run.completed_at) }) }}
    </div>

    <section
      class="card mb-3"
      aria-live="polite"
    >
      <div class="card-body">
        <p class="h3 mb-2">
          {{ $t('checklists.progress', { checked: run.counts.checked, total: run.counts.total }) }}
        </p>
        <div
          class="progress progress-separated mb-2"
          aria-hidden="true"
        >
          <div
            class="progress-bar bg-green"
            :style="{ width: `${percent('confirmed')}%` }"
          />
          <div
            class="progress-bar bg-red"
            :style="{ width: `${percent('missing')}%` }"
          />
        </div>
        <div class="d-flex flex-wrap gap-2">
          <span
            v-for="status in actions"
            :key="status"
            class="badge"
            :class="stateBadge[status]"
          >{{ $t('checklists.countLabel', { label: $t(stateKey(run.mode, status)), count: run.counts[status] }) }}</span>
        </div>
      </div>
    </section>

    <ol class="list-unstyled d-grid gap-2 mb-3">
      <li
        v-for="item in run.items"
        :key="item.id"
        class="card checklist-run-item"
        :class="`checklist-run-item-${item.status}`"
      >
        <div class="card-body p-3">
          <div class="d-flex align-items-center gap-2 mb-2">
            <ItemThumbnail
              :photo-id="item.thumbnail_id"
              :name="item.name"
            />
            <div class="min-w-0 flex-fill">
              <div class="fw-semibold text-break">
                {{ item.name }}
              </div>
              <div class="d-flex flex-wrap align-items-center gap-1">
                <span
                  class="badge"
                  :class="stateBadge[item.status]"
                >{{ $t(stateKey(run.mode, item.status)) }}</span>
                <span
                  v-if="!item.item_id"
                  class="badge bg-warning-lt"
                >{{ $t('checklists.run.itemDeleted') }}</span>
              </div>
            </div>
            <RouterLink
              v-if="item.item_id"
              :to="`/items/${item.item_id}`"
              class="btn btn-icon checklist-touch"
              :title="$t('checklists.run.openItem')"
              :aria-label="$t('checklists.run.openItemNamed', { name: item.name })"
            >
              <IconExternalLink
                :size="18"
                aria-hidden="true"
              />
            </RouterLink>
          </div>
          <template v-if="open">
            <div
              class="checklist-state-actions mb-2"
              role="group"
              :aria-label="$t('checklists.run.stateOf', { name: item.name })"
            >
              <button
                v-for="status in actions"
                :key="status"
                type="button"
                class="btn checklist-touch"
                :class="item.status === status ? `btn-${status === 'confirmed' ? 'success' : status === 'missing' ? 'danger' : 'secondary'}` : 'btn-outline-secondary'"
                :aria-pressed="item.status === status"
                :aria-label="$t('checklists.run.markAs', { name: item.name, state: $t(stateKey(run.mode, status)) })"
                :disabled="busy === item.id"
                @click="update(item, { status })"
              >
                {{ $t(stateKey(run.mode, status)) }}
              </button>
            </div>
            <input
              v-model="notes[item.id]"
              type="text"
              class="form-control form-control-sm"
              :maxlength="MAX_RUN_ITEM_NOTE"
              :placeholder="$t('checklists.run.notePlaceholder')"
              :aria-label="$t('checklists.run.noteNamed', { name: item.name })"
              @change="saveNote(item)"
            >
          </template>
          <p
            v-else-if="item.note"
            class="meta-text mb-0 text-break"
          >
            {{ $t('checklists.run.noteText', { note: item.note }) }}
          </p>
        </div>
      </li>
    </ol>

    <div
      v-if="open"
      class="d-flex justify-content-end"
    >
      <button
        type="button"
        class="btn btn-primary checklist-touch"
        :disabled="completing"
        @click="complete"
      >
        {{ completing ? $t('checklists.run.completing') : $t('checklists.run.complete') }}
      </button>
    </div>
  </template>
</template>
