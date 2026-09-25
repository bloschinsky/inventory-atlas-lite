<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import ItemDraftFields from '../components/ItemDraftFields.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';
import PageHeader from '../components/PageHeader.vue';
import { takePendingAiDraft } from '../aiDraft.js';
import { draftFromItem, useItemDraftForm } from '../itemDraft.js';

const route = useRoute(); const router = useRouter(); const { t } = useI18n();
const editing = computed(() => Boolean(route.params.id));
const { form, categories, fields, start, fieldValues } = useItemDraftForm();
form.parent_item_id = null;
const existingPhotos = ref([]); const photos = ref([]);
const error = ref(''); const saving = ref(false);
const aiDraft = ref(null); const templateDraft = ref(null);
const photoWarning = ref('');
const photoPreviews = ref([]);
const itemId = ref(null); const parent = ref(null); const parentSearch = ref(''); const parentResults = ref([]);

async function searchParents() {
  const query = new URLSearchParams({ search: parentSearch.value });
  if (itemId.value) query.set('excludeId', itemId.value);
  parentResults.value = await api(`/api/items/parent-candidates?${query}`);
}
function selectParent(candidate) {
  parent.value = candidate; form.parent_item_id = candidate ? candidate.id : null;
  parentSearch.value = ''; parentResults.value = [];
}

watch(photos, selected => {
  for (const preview of photoPreviews.value) URL.revokeObjectURL(preview.url);
  photoPreviews.value = selected.map(photo => ({ name: photo.name, url: URL.createObjectURL(photo) }));
});
onBeforeUnmount(() => {
  for (const preview of photoPreviews.value) URL.revokeObjectURL(preview.url);
});
async function save() {
  saving.value = true; error.value = '';
  try {
    const url = editing.value ? `/api/items/${route.params.id}` : '/api/items';
    const item = await api(url, jsonOptions(editing.value ? 'PUT' : 'POST', { ...form, field_values: fieldValues() }));
    if (photos.value.length) {
      const data = new FormData(); for (const photo of photos.value) data.append('photos', photo);
      await api(`/api/items/${item.id}/photos`, { method: 'POST', body: data });
    }
    router.push(`/items/${item.id}`);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}
async function removePhoto(id) { if (confirm(t('photos.confirmDelete'))) { await api(`/api/photos/${id}`, { method: 'DELETE' }); existingPhotos.value = existingPhotos.value.filter(p => p.id !== id); } }

/*
  Every way of opening the form ends in one draft: the item being edited, a pending AI suggestion,
  or a template chosen through ?template=<id>. A new item never keeps a link to its template.
*/
async function loadDraft() {
  if (editing.value) {
    const item = await api(`/api/items/${route.params.id}`);
    form.parent_item_id = item.parent_item_id;
    itemId.value = item.id; parent.value = item.parent;
    existingPhotos.value = item.photos;
    return draftFromItem(item);
  }
  const pending = takePendingAiDraft();
  if (pending) {
    aiDraft.value = pending.draft;
    photoWarning.value = pending.photoWarning;
    photos.value = pending.photo ? [pending.photo] : [];
    return pending.draft;
  }
  if (route.query.template) {
    // A template that cannot be used, such as one whose category was deleted, leaves a blank form.
    try {
      templateDraft.value = await api(`/api/item-templates/${encodeURIComponent(route.query.template)}/item-draft`);
    } catch (e) {
      error.value = e.message;
    }
    return templateDraft.value;
  }
  return null;
}
onMounted(async () => {
  try { await start(await loadDraft()); } catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="form-card">
    <PageHeader :title="editing ? $t('itemForm.editTitle') : (aiDraft ? $t('itemForm.reviewTitle') : $t('items.add'))" />
    <div
      v-if="aiDraft"
      class="alert alert-info"
      role="status"
    >
      {{ $t('itemForm.reviewNotice') }}
      <span v-if="aiDraft.confidence !== null">{{ $t('itemForm.confidence', { percent: Math.round(aiDraft.confidence * 100) }) }}</span>
      <ul
        v-if="aiDraft.warnings?.length"
        class="mb-0 mt-2"
      >
        <li
          v-for="warning in aiDraft.warnings"
          :key="warning"
        >
          {{ warning }}
        </li>
      </ul>
    </div>
    <div
      v-if="templateDraft"
      class="alert alert-info"
      role="status"
    >
      {{ $t('itemForm.templateNotice', { name: templateDraft.templateName }) }}
    </div>
    <div
      v-if="templateDraft?.ignoredFieldCount"
      class="alert alert-warning"
      role="alert"
    >
      {{ $t('templates.ignoredFields') }}
    </div>
    <div
      v-if="photoWarning"
      class="alert alert-warning"
      role="alert"
    >
      {{ photoWarning }}
    </div>
    <div
      v-if="!categories.length"
      class="alert alert-warning"
      role="alert"
    >
      {{ $t('itemForm.noCategories') }} <RouterLink to="/categories">
        {{ $t('itemForm.manageCategories') }}
      </RouterLink>
    </div>
    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <form
      class="card"
      @submit.prevent="save"
    >
      <div class="card-body">
        <ItemDraftFields
          v-model:form="form"
          :categories="categories"
          :fields="fields"
        >
          <div class="mb-3">
            <label class="form-label">{{ $t('items.fields.storedInside') }}</label>
            <div
              v-if="parent"
              class="d-flex align-items-center gap-2 mb-2"
            >
              <span class="badge bg-blue-lt">{{ parent.name }}</span><button
                type="button"
                class="btn btn-link btn-sm p-0"
                @click="selectParent(null)"
              >
                {{ $t('common.clear') }}
              </button>
            </div>
            <div class="input-group">
              <input
                v-model="parentSearch"
                class="form-control"
                :placeholder="$t('itemForm.parentPlaceholder')"
                @keydown.enter.prevent="searchParents"
              ><button
                type="button"
                class="btn btn-outline-secondary"
                @click="searchParents"
              >
                {{ $t('common.search') }}
              </button>
            </div>
            <ul
              v-if="parentResults.length"
              class="list-group mt-2"
            >
              <li
                v-for="candidate in parentResults"
                :key="candidate.id"
                class="list-group-item list-group-item-action d-flex justify-content-between"
                role="button"
                @click="selectParent(candidate)"
              >
                <span>{{ candidate.name }}</span><small class="text-secondary">{{ candidate.category_name }}</small>
              </li>
            </ul>
            <div class="form-text">
              {{ $t('itemForm.parentHelp') }}
            </div>
          </div>
        </ItemDraftFields>
        <hr>
        <h2 class="card-title mb-3">
          {{ $t('photos.title') }}
        </h2>
        <div
          v-if="existingPhotos.length"
          class="d-flex flex-wrap gap-2 mb-3"
        >
          <div
            v-for="photo in existingPhotos"
            :key="photo.id"
            class="position-relative"
          >
            <ItemThumbnail
              :photo-id="photo.id"
              :name="photo.filename"
              large
            />
            <button
              type="button"
              class="btn btn-danger btn-icon btn-sm position-absolute top-0 end-0 p-0 app-thumb-remove"
              :aria-label="$t('itemForm.deletePhoto', { name: photo.filename })"
              @click="removePhoto(photo.id)"
            >
              ×
            </button>
          </div>
        </div>
        <input
          class="form-control"
          type="file"
          :aria-label="$t('itemForm.addPhotos')"
          accept="image/*"
          multiple
          @change="photos = Array.from($event.target.files)"
        >
        <div
          v-if="photoPreviews.length"
          class="d-flex flex-wrap gap-2 mt-3"
        >
          <img
            v-for="preview in photoPreviews"
            :key="preview.url"
            :src="preview.url"
            :alt="preview.name"
            class="img-thumbnail app-selected-photo-preview"
          >
        </div>
        <div class="form-text">
          <span v-if="photos.length">{{ $t('itemForm.photosReady', photos.length) }} </span>
          {{ $t('itemForm.photoLimits') }}
        </div>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="router.back()"
        >
          {{ $t('common.cancel') }}
        </button><button
          class="btn btn-primary"
          :disabled="saving || !categories.length"
        >
          {{ saving ? $t('common.saving') : $t('itemForm.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
