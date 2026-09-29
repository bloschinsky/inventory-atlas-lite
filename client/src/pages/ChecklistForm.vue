<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, jsonOptions } from '../api.js';
import { CHECKLIST_MODES } from '../../../shared/checklists.js';
import { modeKey } from '../checklists.js';
import PageHeader from '../components/PageHeader.vue';
import ChecklistItemPicker from '../components/ChecklistItemPicker.vue';

/*
  Creates or edits a reusable checklist. Existing entries are sent back by their id, so a deleted
  item's entry survives until the user removes it; new ones are sent by item id. Runs that already
  exist are never affected by saving.
*/
const route = useRoute();
const router = useRouter();
const editing = computed(() => Boolean(route.params.id));
const form = ref({ name: '', description: '', mode: 'packing' });
const entries = ref([]);
const error = ref('');
const saving = ref(false);
const loaded = ref(!route.params.id);

async function save() {
  saving.value = true; error.value = '';
  try {
    const body = {
      ...form.value,
      items: entries.value.map(entry => (entry.id ? { id: entry.id } : { item_id: entry.item_id }))
    };
    const saved = await api(editing.value ? `/api/checklists/${route.params.id}` : '/api/checklists',
      jsonOptions(editing.value ? 'PUT' : 'POST', body));
    router.push(`/checklists/${saved.id}`);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

onMounted(async () => {
  if (!editing.value) return;
  try {
    const checklist = await api(`/api/checklists/${route.params.id}`);
    form.value = { name: checklist.name, description: checklist.description ?? '', mode: checklist.mode };
    entries.value = checklist.items;
    loaded.value = true;
  } catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="form-card">
    <PageHeader :title="editing ? $t('checklists.editTitle') : $t('checklists.add')" />
    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <form
      v-if="loaded"
      class="card"
      @submit.prevent="save"
    >
      <div class="card-body">
        <div class="mb-3">
          <label
            class="form-label"
            for="checklist-name"
          >{{ $t('checklists.name') }} *</label>
          <input
            id="checklist-name"
            v-model="form.name"
            class="form-control"
            required
          >
        </div>
        <div class="mb-3">
          <label
            class="form-label"
            for="checklist-description"
          >{{ $t('checklists.description') }}</label>
          <textarea
            id="checklist-description"
            v-model="form.description"
            class="form-control"
            rows="2"
          />
        </div>
        <fieldset class="mb-3">
          <legend class="form-label">
            {{ $t('checklists.mode') }}
          </legend>
          <div class="form-selectgroup form-selectgroup-boxes d-flex flex-column flex-sm-row gap-2">
            <label
              v-for="mode in CHECKLIST_MODES"
              :key="mode"
              class="form-selectgroup-item flex-fill"
            >
              <input
                v-model="form.mode"
                type="radio"
                name="checklist-mode"
                :value="mode"
                class="form-selectgroup-input"
              >
              <span class="form-selectgroup-label d-block text-start p-3">
                <span class="fw-semibold d-block">{{ $t(modeKey(mode)) }}</span>
                <span class="meta-text">{{ $t(`checklists.modeHelp.${mode}`) }}</span>
              </span>
            </label>
          </div>
        </fieldset>
        <hr>
        <ChecklistItemPicker v-model="entries" />
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="router.back()"
        >
          {{ $t('common.cancel') }}
        </button>
        <button
          class="btn btn-primary"
          :disabled="saving"
        >
          {{ saving ? $t('common.saving') : $t('checklists.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
