<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { modeKey } from '../checklists.js';
import PageHeader from '../components/PageHeader.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';
import ChecklistRunHistory from '../components/ChecklistRunHistory.vue';

// One reusable checklist: its expected items in the saved order and every run made from it.
const { t } = useI18n();
const route = useRoute();
const router = useRouter();
const checklist = ref(null);
const runs = ref([]);
const error = ref('');
const starting = ref(false);

const openRun = computed(() => runs.value.find(run => run.status === 'in_progress'));
const hasDeleted = computed(() => checklist.value?.items.some(entry => entry.deleted));

async function load() {
  error.value = '';
  try {
    [checklist.value, runs.value] = await Promise.all([
      api(`/api/checklists/${route.params.id}`),
      api(`/api/checklists/${route.params.id}/runs`)
    ]);
  } catch (e) { error.value = e.message; }
}

async function start() {
  starting.value = true; error.value = '';
  try {
    const run = await api(`/api/checklists/${checklist.value.id}/runs`, { method: 'POST' });
    router.push(`/checklists/runs/${run.id}`);
  } catch (e) { error.value = e.message; } finally { starting.value = false; }
}

async function remove() {
  if (!confirm(t('checklists.confirmDelete', { name: checklist.value.name }))) return;
  try {
    await api(`/api/checklists/${checklist.value.id}`, { method: 'DELETE' });
    router.push('/checklists');
  } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>

<template>
  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    {{ error }}
  </div>
  <template v-if="checklist">
    <PageHeader
      :title="checklist.name"
      :subtitle="$t(modeKey(checklist.mode))"
    >
      <template #actions>
        <RouterLink
          v-if="openRun"
          :to="`/checklists/runs/${openRun.id}`"
          class="btn btn-primary"
        >
          {{ $t('checklists.continueRun') }}
        </RouterLink>
        <button
          type="button"
          class="btn"
          :class="{ 'btn-primary': !openRun }"
          :disabled="starting"
          @click="start"
        >
          {{ runs.length ? $t('checklists.runAgain') : $t('checklists.start') }}
        </button>
        <RouterLink
          :to="`/checklists/${checklist.id}/edit`"
          class="btn"
        >
          {{ $t('common.edit') }}
        </RouterLink>
        <button
          type="button"
          class="btn btn-outline-danger"
          @click="remove"
        >
          {{ $t('common.delete') }}
        </button>
      </template>
    </PageHeader>

    <p
      v-if="checklist.description"
      class="text-secondary text-break checklist-description"
    >
      {{ checklist.description }}
    </p>

    <section
      class="card mb-3"
      aria-labelledby="checklist-expected-items"
    >
      <div class="card-header">
        <h2
          id="checklist-expected-items"
          class="card-title"
        >
          {{ $t('checklists.expectedItems') }}
        </h2>
        <span class="card-subtitle ms-2">{{ $t('counts.items', checklist.items.length) }}</span>
      </div>
      <div
        v-if="!checklist.items.length"
        class="card-body text-secondary"
      >
        {{ $t('checklists.noItems') }}
      </div>
      <ol
        v-else
        class="list-group list-group-flush"
      >
        <li
          v-for="entry in checklist.items"
          :key="entry.id"
          class="list-group-item d-flex align-items-center gap-3"
        >
          <ItemThumbnail
            :photo-id="entry.thumbnail_id"
            :name="entry.name"
          />
          <div class="min-w-0">
            <RouterLink
              v-if="!entry.deleted"
              :to="`/items/${entry.item_id}`"
              class="item-card-link"
            >
              {{ entry.name }}
            </RouterLink>
            <span
              v-else
              class="text-break text-secondary"
            >{{ entry.name }}</span>
            <div class="meta-text">
              <span
                v-if="entry.deleted"
                class="badge bg-warning-lt"
              >{{ $t('checklists.deletedItem') }}</span>
              <template v-else>
                {{ [entry.category_name, entry.effective_location].filter(Boolean).join(' · ') }}
              </template>
            </div>
          </div>
        </li>
      </ol>
      <div
        v-if="hasDeleted"
        class="card-footer meta-text"
      >
        {{ $t('checklists.deletedSkipped') }}
      </div>
    </section>

    <section
      class="card"
      aria-labelledby="checklist-run-history"
    >
      <div class="card-header">
        <h2
          id="checklist-run-history"
          class="card-title"
        >
          {{ $t('checklists.history') }}
        </h2>
      </div>
      <div
        v-if="!runs.length"
        class="card-body text-secondary"
      >
        {{ $t('checklists.noRuns') }}
      </div>
      <ChecklistRunHistory
        v-else
        :runs="runs"
      />
    </section>
  </template>
</template>
