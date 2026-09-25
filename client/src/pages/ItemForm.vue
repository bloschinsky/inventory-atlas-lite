<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import FieldAutocomplete from '../components/FieldAutocomplete.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';
import PageHeader from '../components/PageHeader.vue';
import { takePendingAiDraft } from '../aiDraft.js';

const route = useRoute(); const router = useRouter(); const { t } = useI18n();
const editing = computed(() => Boolean(route.params.id));
const categories = ref([]); const fields = ref([]); const existingPhotos = ref([]); const photos = ref([]);
const error = ref(''); const saving = ref(false); const initialized = ref(false);
const aiDraft = ref(null);
const photoWarning = ref('');
const photoPreviews = ref([]);
const currencies = Intl.supportedValuesOf('currency');
const form = reactive({
  name: '', category_id: '', description: '', condition: '', location: '', purchase_date: '',
  purchase_price: { amount: '', currency: 'UAH' }, serial_number: '', transferred_to: '', parent_item_id: null,
  field_values: {}
});
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

async function loadFields(categoryId) {
  if (!categoryId) { fields.value = []; return; }
  fields.value = await api(`/api/categories/${categoryId}/fields`);
  for (const field of fields.value) if (!(field.id in form.field_values)) form.field_values[field.id] = field.type === 'boolean' ? '0' : '';
}
watch(() => form.category_id, async id => { if (initialized.value) await loadFields(id); });
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
    const body = {
      ...form,
      field_values: Object.fromEntries(fields.value.map(field => [field.id, form.field_values[field.id]]))
    };
    const item = await api(url, jsonOptions(editing.value ? 'PUT' : 'POST', body));
    if (photos.value.length) {
      const data = new FormData(); for (const photo of photos.value) data.append('photos', photo);
      await api(`/api/items/${item.id}/photos`, { method: 'POST', body: data });
    }
    router.push(`/items/${item.id}`);
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}
async function removePhoto(id) { if (confirm(t('photos.confirmDelete'))) { await api(`/api/photos/${id}`, { method: 'DELETE' }); existingPhotos.value = existingPhotos.value.filter(p => p.id !== id); } }
onMounted(async () => {
  try {
    categories.value = await api('/api/categories');
    if (editing.value) {
      const item = await api(`/api/items/${route.params.id}`);
      Object.assign(form, {
        name: item.name, category_id: item.category_id, description: item.description || '',
        condition: item.condition || '', location: item.location || '', purchase_date: item.purchase_date || '',
        purchase_price: item.purchase_price || { amount: '', currency: 'UAH' },
        serial_number: item.serial_number || '', transferred_to: item.transferred_to || '',
        parent_item_id: item.parent_item_id
      });
      itemId.value = item.id; parent.value = item.parent;
      for (const field of item.fields) form.field_values[field.id] = field.value ?? (field.type === 'boolean' ? '0' : '');
      existingPhotos.value = item.photos;
      await loadFields(item.category_id);
    } else {
      const pending = takePendingAiDraft();
      if (pending) {
        aiDraft.value = pending.draft;
        photoWarning.value = pending.photoWarning;
        const base = pending.draft.baseFields || {};
        form.name = base.name || '';
        form.category_id = pending.draft.categoryId || '';
        form.description = base.description || '';
        form.condition = base.condition || '';
        form.location = base.location || '';
        form.purchase_date = base.purchase_date || '';
        form.purchase_price = base.purchase_price || { amount: '', currency: 'UAH' };
        form.serial_number = base.serial_number || '';
        photos.value = pending.photo ? [pending.photo] : [];
        if (form.category_id) {
          await loadFields(form.category_id);
          for (const field of fields.value) {
            if (Object.hasOwn(pending.draft.dynamicFields || {}, field.id)) {
              form.field_values[field.id] = pending.draft.dynamicFields[field.id];
            }
          }
        }
      }
    }
    initialized.value = true;
  } catch (e) { error.value = e.message; }
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
        <div class="mb-3">
          <label
            class="form-label"
            for="item-name"
          >{{ $t('items.fields.name') }} *</label><input
            id="item-name"
            v-model="form.name"
            class="form-control"
            required
          >
        </div>
        <div class="mb-3">
          <label
            class="form-label"
            for="item-category"
          >{{ $t('items.fields.category') }} *</label><select
            id="item-category"
            v-model="form.category_id"
            class="form-select"
            required
          >
            <option
              value=""
              disabled
            >
              {{ $t('common.selectCategory') }}
            </option><option
              v-for="c in categories"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="item-condition"
            >{{ $t('items.fields.condition') }}</label><input
              id="item-condition"
              v-model="form.condition"
              class="form-control"
              :placeholder="$t('itemForm.conditionPlaceholder')"
            >
          </div><div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="item-location"
            >{{ $t('items.fields.location') }}</label><input
              id="item-location"
              v-model="form.location"
              class="form-control"
              :placeholder="$t('itemForm.locationPlaceholder')"
            >
            <div
              v-if="form.parent_item_id"
              class="form-text"
            >
              {{ $t('items.inheritedLocation') }} {{ $t('itemForm.ownLocation') }}
            </div>
          </div>
        </div>
        <div class="mb-3">
          <label
            class="form-label"
            for="item-transferred-to"
          >{{ $t('items.fields.transferredTo') }}</label>
          <FieldAutocomplete
            v-model="form.transferred_to"
            input-id="item-transferred-to"
            source="/api/items/transferred-to-suggestions"
            maxlength="255"
            :placeholder="$t('itemForm.transferredToPlaceholder')"
          />
          <div class="form-text">
            {{ $t('itemForm.transferredToHelp') }}
          </div>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="item-purchase-date"
            >{{ $t('items.fields.purchaseDate') }}</label><input
              id="item-purchase-date"
              v-model="form.purchase_date"
              class="form-control"
              type="date"
            >
          </div><div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="item-serial-number"
            >{{ $t('items.fields.serialNumber') }}</label><input
              id="item-serial-number"
              v-model="form.serial_number"
              class="form-control"
              maxlength="255"
            >
          </div>
        </div>
        <div class="mb-3">
          <label
            class="form-label"
            for="item-purchase-price"
          >{{ $t('items.fields.purchasePrice') }}</label>
          <div class="input-group">
            <input
              id="item-purchase-price"
              v-model="form.purchase_price.amount"
              class="form-control"
              type="text"
              inputmode="decimal"
              pattern="[0-9]+([.][0-9]{1,4})?"
              placeholder="0.00"
            ><select
              v-model="form.purchase_price.currency"
              class="form-select"
              :aria-label="$t('itemForm.currency')"
            >
              <option
                v-for="currency in currencies"
                :key="currency"
                :value="currency"
              >
                {{ currency }}
              </option>
            </select>
          </div>
          <div class="form-text">
            {{ $t('itemForm.priceHelp') }}
          </div>
        </div>
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
        <div class="mb-3">
          <label
            class="form-label"
            for="item-description"
          >{{ $t('items.fields.description') }}</label><textarea
            id="item-description"
            v-model="form.description"
            class="form-control"
            rows="3"
          />
        </div>
        <template v-if="fields.length">
          <hr>
          <h2 class="card-title mb-3">
            {{ $t('itemForm.categoryFields') }}
          </h2>
          <div
            v-for="field in fields"
            :key="field.id"
            class="mb-3"
          >
            <label
              class="form-label"
              :for="`field-${field.id}`"
            >{{ field.name }}</label>
            <select
              v-if="field.type === 'boolean'"
              :id="`field-${field.id}`"
              v-model="form.field_values[field.id]"
              class="form-select"
            >
              <option value="0">
                {{ $t('common.no') }}
              </option><option value="1">
                {{ $t('common.yes') }}
              </option>
            </select>
            <FieldAutocomplete
              v-else-if="field.type === 'text'"
              v-model="form.field_values[field.id]"
              :input-id="`field-${field.id}`"
              :source="`/api/fields/${field.id}/suggestions`"
            />
            <input
              v-else
              :id="`field-${field.id}`"
              v-model="form.field_values[field.id]"
              class="form-control"
              :type="field.type"
            >
          </div>
        </template>
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
