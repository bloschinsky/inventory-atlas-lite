<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { IconChevronLeft, IconChevronRight, IconStar, IconStarFilled, IconTrash } from '@tabler/icons-vue';
import { api, jsonOptions, photoUrl } from '../api.js';
import ItemDraftFields from '../components/ItemDraftFields.vue';
import PageHeader from '../components/PageHeader.vue';
import { takePendingAiDraft } from '../aiDraft.js';
import { draftFromItem, useItemDraftForm } from '../itemDraft.js';

const route = useRoute(); const router = useRouter(); const { t } = useI18n();
const editing = computed(() => Boolean(route.params.id));
const { form, categories, fields, start, fieldValues } = useItemDraftForm();
form.parent_item_id = null;
const error = ref(''); const saving = ref(false);
const aiDraft = ref(null); const templateDraft = ref(null); const duplicateSource = ref(null);
const photoWarning = ref('');
const itemId = ref(null); const parent = ref(null); const parentSearch = ref(''); const parentResults = ref([]);

async function searchParents() {
  const query = new URLSearchParams({ search: parentSearch.value });
  if (itemId.value) query.set('excludeId', itemId.value);
  parentResults.value = await api(`/api/items/parent-candidates?${query}`);
}
function selectParent(candidate) {
  parent.value = candidate; form.parent_item_id = candidate ? candidate.id : null;
  parentSearch.value = ''; parentResults.value = [];
  placement.value = '';
}

/*
  Taking an item out of its container ends the inherited location, and its own saved location may
  be long out of date. Saving then requires an explicit choice of where the item physically is, so a
  stale value never silently becomes the new truth. `stored` is what the item had when it was loaded.
*/
const stored = ref(null); const placement = ref('');
const detaching = computed(() => Boolean(stored.value?.parent && !form.parent_item_id));
const sameLocation = (a, b) => (a ?? '').trim().toLowerCase() === (b ?? '').trim().toLowerCase();
const placementOptions = computed(() => {
  if (!detaching.value) return [];
  const { effective, own } = stored.value;
  return [
    effective && { value: 'keep', label: t('itemForm.detach.keep', { location: effective }) },
    own?.trim() && !sameLocation(own, effective) && { value: 'saved', label: t('itemForm.detach.saved', { location: own }) },
    { value: 'other', label: t('itemForm.detach.other') },
    { value: 'none', label: t('itemForm.detach.none') }
  ].filter(Boolean);
});
async function choosePlacement(value) {
  placement.value = value;
  form.location = { keep: stored.value.effective, saved: stored.value.own }[value] ?? '';
  if (value === 'other') {
    await nextTick();
    document.getElementById('item-location')?.focus();
  }
}

/*
  Saved photos ({ id }) and newly selected files ({ file, url }) share one visible order; its first
  photo is the cover. `savedOrder` is the order the server holds, so Save sends an order only when
  the visible one differs from it. New files are uploaded in their visible order, which appends them
  after the saved photos, and the combined order is then stored with the ids the upload returned.
*/
const photos = ref([]); const savedOrder = ref([]);
let photoKey = 0;
const savedPhoto = photo => ({ key: `photo-${photo.id}`, id: photo.id, name: photo.filename, url: photoUrl(photo.id), file: null });
const selectedPhoto = file => ({ key: `file-${photoKey++}`, id: null, name: file.name, url: URL.createObjectURL(file), file });
const photoHelp = computed(() => {
  const selected = photos.value.filter(photo => photo.file).length;
  return [selected && t('itemForm.photosReady', selected), photos.value.length > 1 && t('itemForm.photoOrderHelp'), t('itemForm.photoLimits')]
    .filter(Boolean).join(' ');
});
const releasePreview = photo => { if (photo.file) URL.revokeObjectURL(photo.url); };

function addPhotos(event) {
  photos.value = [...photos.value, ...Array.from(event.target.files).map(selectedPhoto)];
  event.target.value = '';
}
// Focus follows the moved photo, so the arrows can be pressed again from the keyboard.
async function movePhoto(index, target) {
  const list = [...photos.value];
  const [photo] = list.splice(index, 1);
  list.splice(target, 0, photo);
  photos.value = list;
  await nextTick();
  const control = document.getElementById(`${photo.key}-${target < index ? 'left' : 'right'}`);
  (control && !control.disabled ? control : document.getElementById(`${photo.key}-delete`))?.focus();
}
async function removePhoto(photo) {
  if (photo.id) {
    if (!confirm(t('photos.confirmDelete'))) return;
    try { await api(`/api/photos/${photo.id}`, { method: 'DELETE' }); } catch (e) { error.value = e.message; return; }
    savedOrder.value = savedOrder.value.filter(id => id !== photo.id);
  }
  releasePreview(photo);
  photos.value = photos.value.filter(entry => entry !== photo);
}
onBeforeUnmount(() => photos.value.forEach(releasePreview));

async function savePhotos(id) {
  const selected = photos.value.filter(photo => photo.file);
  if (selected.length) {
    const data = new FormData(); for (const photo of selected) data.append('photos', photo.file);
    const created = await api(`/api/items/${id}/photos`, { method: 'POST', body: data });
    // An uploaded file becomes a saved photo, so a failed reorder never uploads it twice.
    const uploaded = new Map(selected.map((photo, index) => [photo.key, savedPhoto(created[index])]));
    selected.forEach(releasePreview);
    photos.value = photos.value.map(photo => uploaded.get(photo.key) || photo);
    savedOrder.value = [...savedOrder.value, ...created.map(photo => photo.id)];
  }
  const order = photos.value.map(photo => photo.id);
  if (order.join() !== savedOrder.value.join()) {
    await api(`/api/items/${id}/photos/order`, jsonOptions('PUT', { photo_ids: order }));
    savedOrder.value = order;
  }
}
async function save() {
  saving.value = true; error.value = '';
  try {
    const url = editing.value ? `/api/items/${route.params.id}` : '/api/items';
    const item = await api(url, jsonOptions(editing.value ? 'PUT' : 'POST', { ...form, field_values: fieldValues() }));
    await savePhotos(item.id);
    router.push(`/items/${item.id}`);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

/*
  Every way of opening the form ends in one draft: the item being edited, a pending AI suggestion,
  a template chosen through ?template=<id>, or an item duplicated through ?duplicate=<id>. A new item
  never keeps a link to its template or source item. A duplicate copies only the draft values: its
  container, photos, and identity stay with the source item, so it starts top-level and without photos.
*/
async function loadDraft() {
  if (editing.value) {
    const item = await api(`/api/items/${route.params.id}`);
    form.parent_item_id = item.parent_item_id;
    itemId.value = item.id; parent.value = item.parent;
    stored.value = { parent: item.parent, effective: item.effective_location, own: item.location };
    photos.value = item.photos.map(savedPhoto);
    savedOrder.value = item.photos.map(photo => photo.id);
    return draftFromItem(item);
  }
  const pending = takePendingAiDraft();
  if (pending) {
    aiDraft.value = pending.draft;
    photoWarning.value = pending.photoWarning;
    photos.value = pending.photo ? [selectedPhoto(pending.photo)] : [];
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
  if (route.query.duplicate) {
    // A source item that no longer exists leaves a blank form, like an unusable template.
    try {
      duplicateSource.value = await api(`/api/items/${encodeURIComponent(route.query.duplicate)}`);
    } catch (e) {
      error.value = e.message;
    }
    return duplicateSource.value && draftFromItem(duplicateSource.value);
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
      v-if="duplicateSource"
      class="alert alert-info"
      role="status"
    >
      {{ $t('itemForm.duplicateNotice', { name: duplicateSource.name }) }}
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
      data-tour="item-form"
      @submit.prevent="save"
    >
      <div class="card-body">
        <ItemDraftFields
          v-model:form="form"
          :categories="categories"
          :fields="fields"
          :duplicate="Boolean(duplicateSource)"
        >
          <div
            class="mb-3"
            data-tour="item-parent"
          >
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
                data-tour="item-parent-search"
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
              data-tour="item-parent-results"
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
          <fieldset
            v-if="detaching"
            class="alert alert-warning d-block"
          >
            <legend class="alert-title fs-4">
              {{ $t('itemForm.detach.title') }}
            </legend>
            <p class="mb-2">
              {{ $t('itemForm.detach.help', { name: stored.parent.name }) }}
            </p>
            <label
              v-for="option in placementOptions"
              :key="option.value"
              class="form-check"
            >
              <input
                class="form-check-input"
                type="radio"
                name="item-placement"
                :value="option.value"
                :checked="placement === option.value"
                required
                @change="choosePlacement(option.value)"
              >
              <span class="form-check-label text-break">{{ option.label }}</span>
            </label>
          </fieldset>
        </ItemDraftFields>
        <hr>
        <h2 class="card-title mb-3">
          {{ $t('photos.title') }}
        </h2>
        <ol
          v-if="photos.length"
          class="list-unstyled d-flex flex-wrap gap-3 mb-3"
          :aria-label="$t('photos.title')"
        >
          <li
            v-for="(photo, index) in photos"
            :key="photo.key"
            class="app-photo-tile"
          >
            <div class="app-photo-tile-frame">
              <img
                :src="photo.url"
                :alt="photo.name"
              >
              <span
                v-if="index === 0"
                class="badge bg-yellow text-yellow-fg app-photo-tile-badge"
              >
                <IconStarFilled
                  :size="12"
                  aria-hidden="true"
                />
                {{ $t('photos.cover') }}
              </span>
              <span
                v-if="photo.file"
                class="badge bg-blue text-blue-fg app-photo-tile-badge app-photo-tile-badge-end"
              >{{ $t('itemForm.unsavedPhoto') }}</span>
            </div>
            <div class="d-flex justify-content-between gap-1 mt-1">
              <button
                :id="`${photo.key}-left`"
                type="button"
                class="btn btn-icon app-photo-tile-action"
                :disabled="index === 0"
                :title="$t('photos.moveLeft')"
                :aria-label="$t('itemForm.movePhotoLeft', { name: photo.name })"
                @click="movePhoto(index, index - 1)"
              >
                <IconChevronLeft
                  :size="18"
                  aria-hidden="true"
                />
              </button>
              <button
                v-if="index > 0"
                type="button"
                class="btn btn-icon app-photo-tile-action"
                :title="$t('photos.makeCover')"
                :aria-label="$t('itemForm.makeCover', { name: photo.name })"
                @click="movePhoto(index, 0)"
              >
                <IconStar
                  :size="18"
                  aria-hidden="true"
                />
              </button>
              <button
                :id="`${photo.key}-right`"
                type="button"
                class="btn btn-icon app-photo-tile-action"
                :disabled="index === photos.length - 1"
                :title="$t('photos.moveRight')"
                :aria-label="$t('itemForm.movePhotoRight', { name: photo.name })"
                @click="movePhoto(index, index + 1)"
              >
                <IconChevronRight
                  :size="18"
                  aria-hidden="true"
                />
              </button>
              <button
                :id="`${photo.key}-delete`"
                type="button"
                class="btn btn-icon btn-outline-danger app-photo-tile-action"
                :title="$t('photos.delete')"
                :aria-label="$t('itemForm.deletePhoto', { name: photo.name })"
                @click="removePhoto(photo)"
              >
                <IconTrash
                  :size="18"
                  aria-hidden="true"
                />
              </button>
            </div>
          </li>
        </ol>
        <input
          class="form-control"
          type="file"
          data-tour="item-photos"
          :aria-label="$t('itemForm.addPhotos')"
          accept="image/*"
          multiple
          @change="addPhotos"
        >
        <div class="form-text">
          {{ photoHelp }}
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
          data-tour="item-save"
          :disabled="saving || !categories.length"
        >
          {{ saving ? $t('common.saving') : $t('itemForm.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
