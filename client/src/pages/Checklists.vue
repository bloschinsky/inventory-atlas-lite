<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { formatDateTime } from '../i18n/index.js';
import { modeKey, stateBadge, stateKey } from '../checklists.js';
import PageHeader from '../components/PageHeader.vue';
import ChecklistRunHistory from '../components/ChecklistRunHistory.vue';

// Reusable checklists with their latest result, the history left behind by deleted checklists, and
// the container audits, which are runs without a reusable checklist.
defineOptions({ name: 'ChecklistList' });
const { t } = useI18n();
const router = useRouter();
const checklists = ref([]);
const orphanRuns = ref([]);
const auditRuns = ref([]);
const loading = ref(true);
const starting = ref(null);
const error = ref('');

const countLabel = computed(() => t('checklists.count', checklists.value.length));

async function load() {
  loading.value = true; error.value = '';
  try {
    const [list, runs] = await Promise.all([api('/api/checklists'), api('/api/checklist-runs')]);
    checklists.value = list;
    orphanRuns.value = runs.filter(run => run.source === 'checklist' && run.checklist_id === null);
    auditRuns.value = runs.filter(run => run.source === 'container_audit');
  } catch (e) { error.value = e.message; } finally { loading.value = false; }
}

// Every start is a new run; earlier runs are never reset.
async function start(checklist) {
  starting.value = checklist.id; error.value = '';
  try {
    const run = await api(`/api/checklists/${checklist.id}/runs`, { method: 'POST' });
    router.push(`/checklists/runs/${run.id}`);
  } catch (e) { error.value = e.message; } finally { starting.value = null; }
}

async function remove(checklist) {
  if (!confirm(t('checklists.confirmDelete', { name: checklist.name }))) return;
  try {
    await api(`/api/checklists/${checklist.id}`, { method: 'DELETE' });
    await load();
  } catch (e) { error.value = e.message; }
}
onMounted(load);
</script>

<template>
  <PageHeader
    :title="$t('checklists.title')"
    :subtitle="countLabel"
  >
    <template #actions>
      <RouterLink
        to="/checklists/new"
        class="btn btn-primary"
      >
        {{ $t('checklists.add') }}
      </RouterLink>
    </template>
  </PageHeader>

  <p class="text-secondary">
    {{ $t('checklists.intro') }}
  </p>

  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    {{ error }}
  </div>

  <div
    v-if="loading"
    class="card"
  >
    <div class="card-body d-flex align-items-center gap-2 text-secondary">
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      {{ $t('checklists.loading') }}
    </div>
  </div>
  <div
    v-else-if="!checklists.length"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        {{ $t('checklists.emptyTitle') }}
      </p>
      <p class="empty-subtitle text-secondary">
        {{ $t('checklists.emptyText') }}
      </p>
    </div>
  </div>
  <div
    v-else
    class="row row-cards"
    data-tour="checklist-list"
  >
    <div
      v-for="checklist in checklists"
      :key="checklist.id"
      class="col-md-6 col-xl-4"
    >
      <article
        class="card h-100"
        :aria-label="checklist.name"
      >
        <div class="card-body">
          <h2 class="card-title mb-1 text-break">
            <RouterLink
              :to="`/checklists/${checklist.id}`"
              class="item-card-link"
            >
              {{ checklist.name }}
            </RouterLink>
          </h2>
          <div class="d-flex flex-wrap gap-2 mb-2">
            <span class="badge bg-azure-lt">{{ $t(modeKey(checklist.mode)) }}</span>
            <span class="meta-text">{{ $t('counts.items', checklist.item_count) }}</span>
          </div>
          <dl class="row mb-0 meta-text">
            <dt class="col-5 fw-normal">
              {{ $t('checklists.lastRun') }}
            </dt>
            <dd class="col-7 mb-1">
              <template v-if="checklist.last_run">
                {{ formatDateTime(checklist.last_run.started_at) }}
                <span class="d-block">{{ $t(`checklists.runStatus.${checklist.last_run.status}`) }}</span>
              </template>
              <template v-else>
                {{ $t('checklists.neverRun') }}
              </template>
            </dd>
            <template v-if="checklist.last_run">
              <dt class="col-5 fw-normal">
                {{ $t('checklists.lastResult') }}
              </dt>
              <dd class="col-7 mb-0">
                {{ $t('checklists.progress', { checked: checklist.last_run.counts.checked, total: checklist.last_run.counts.total }) }}
                <span class="d-flex flex-wrap gap-1 mt-1">
                  <span
                    v-for="status in ['confirmed', 'missing']"
                    :key="status"
                    class="badge"
                    :class="stateBadge[status]"
                  >{{ $t('checklists.countLabel', { label: $t(stateKey(checklist.last_run.mode, status)), count: checklist.last_run.counts[status] }) }}</span>
                </span>
              </dd>
            </template>
          </dl>
        </div>
        <div class="card-footer d-flex flex-wrap gap-2">
          <RouterLink
            :to="`/checklists/${checklist.id}`"
            class="btn"
            :aria-label="$t('checklists.openNamed', { name: checklist.name })"
          >
            {{ $t('checklists.open') }}
          </RouterLink>
          <button
            type="button"
            class="btn btn-primary"
            :disabled="starting === checklist.id"
            :aria-label="$t('checklists.startNamed', { name: checklist.name })"
            @click="start(checklist)"
          >
            {{ $t('checklists.start') }}
          </button>
          <RouterLink
            :to="`/checklists/${checklist.id}/edit`"
            class="btn"
            :aria-label="$t('checklists.editNamed', { name: checklist.name })"
          >
            {{ $t('common.edit') }}
          </RouterLink>
          <button
            type="button"
            class="btn btn-outline-danger ms-auto"
            :aria-label="$t('checklists.deleteNamed', { name: checklist.name })"
            @click="remove(checklist)"
          >
            {{ $t('common.delete') }}
          </button>
        </div>
      </article>
    </div>
  </div>

  <section
    v-if="auditRuns.length"
    class="card mt-3"
    aria-labelledby="audit-history"
  >
    <div class="card-header">
      <h2
        id="audit-history"
        class="card-title"
      >
        {{ $t('checklists.audit.history') }}
      </h2>
    </div>
    <ChecklistRunHistory
      :runs="auditRuns"
      show-name
    />
  </section>

  <section
    v-if="orphanRuns.length"
    class="card mt-3"
    aria-labelledby="deleted-checklist-runs"
  >
    <div class="card-header">
      <h2
        id="deleted-checklist-runs"
        class="card-title"
      >
        {{ $t('checklists.deletedHistory') }}
      </h2>
    </div>
    <ChecklistRunHistory
      :runs="orphanRuns"
      show-name
    />
  </section>
</template>
