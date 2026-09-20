<script setup>
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, jsonOptions } from '../api.js';
import FieldAutocomplete from '../components/FieldAutocomplete.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';
import PageHeader from '../components/PageHeader.vue';
import { takePendingAiDraft } from '../aiDraft.js';

const route = useRoute(); const router = useRouter();
const editing = computed(() => Boolean(route.params.id));
const categories = ref([]); const fields = ref([]); const existingPhotos = ref([]); const photos = ref([]);
const error = ref(''); const saving = ref(false); const initialized = ref(false);
const aiDraft = ref(null);
const photoWarning = ref('');
const photoPreviews = ref([]);
const currencies = Intl.supportedValuesOf('currency');
const form = reactive({
  name: '', category_id: '', description: '', condition: '', location: '', purchase_date: '',
  purchase_price: { amount: '', currency: 'UAH' }, serial_number: '', parent_item_id: null, field_values: {}
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
async function removePhoto(id) { if (confirm('Delete this photo?')) { await api(`/api/photos/${id}`, { method: 'DELETE' }); existingPhotos.value = existingPhotos.value.filter(p => p.id !== id); } }
onMounted(async () => {
  try {
    categories.value = await api('/api/categories');
    if (editing.value) {
      const item = await api(`/api/items/${route.params.id}`);
      Object.assign(form, {
        name: item.name, category_id: item.category_id, description: item.description || '',
        condition: item.condition || '', location: item.location || '', purchase_date: item.purchase_date || '',
        purchase_price: item.purchase_price || { amount: '', currency: 'UAH' },
        serial_number: item.serial_number || '', parent_item_id: item.parent_item_id
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
        photos.value = [pending.photo];
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
    <PageHeader :title="editing ? 'Edit item' : (aiDraft ? 'Review AI item' : 'Add item')" />
    <div
      v-if="aiDraft"
      class="alert alert-info"
      role="status"
    >
      Review and edit every suggested value before saving.
      <span v-if="aiDraft.confidence !== null">AI confidence: {{ Math.round(aiDraft.confidence * 100) }}%.</span>
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
      Create a category before adding an item. <RouterLink to="/categories">
        Manage categories
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
          >Name *</label><input
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
          >Category *</label><select
            id="item-category"
            v-model="form.category_id"
            class="form-select"
            required
          >
            <option
              value=""
              disabled
            >
              Select category
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
            >Condition</label><input
              id="item-condition"
              v-model="form.condition"
              class="form-control"
              placeholder="Good, needs repair…"
            >
          </div><div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="item-location"
            >Location</label><input
              id="item-location"
              v-model="form.location"
              class="form-control"
              placeholder="Garage, box A…"
            >
          </div>
        </div>
        <div class="row">
          <div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="item-purchase-date"
            >Purchase Date</label><input
              id="item-purchase-date"
              v-model="form.purchase_date"
              class="form-control"
              type="date"
            >
          </div><div class="col-md-6 mb-3">
            <label
              class="form-label"
              for="item-serial-number"
            >Serial Number</label><input
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
          >Purchase Price</label>
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
              aria-label="Purchase Price currency"
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
            Clear the amount to leave the purchase price unspecified.
          </div>
        </div>
        <div class="mb-3">
          <label class="form-label">Stored inside</label>
          <div
            v-if="parent"
            class="d-flex align-items-center gap-2 mb-2"
          >
            <span class="badge bg-blue-lt">{{ parent.name }}</span><button
              type="button"
              class="btn btn-link btn-sm p-0"
              @click="selectParent(null)"
            >
              Clear
            </button>
          </div>
          <div class="input-group">
            <input
              v-model="parentSearch"
              class="form-control"
              placeholder="Search an item to store this one in…"
              @keydown.enter.prevent="searchParents"
            ><button
              type="button"
              class="btn btn-outline-secondary"
              @click="searchParents"
            >
              Search
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
            Leave empty to keep this item top-level.
          </div>
        </div>
        <div class="mb-3">
          <label
            class="form-label"
            for="item-description"
          >Description</label><textarea
            id="item-description"
            v-model="form.description"
            class="form-control"
            rows="3"
          />
        </div>
        <template v-if="fields.length">
          <hr>
          <h2 class="card-title mb-3">
            Category fields
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
                No
              </option><option value="1">
                Yes
              </option>
            </select>
            <FieldAutocomplete
              v-else-if="field.type === 'text'"
              v-model="form.field_values[field.id]"
              :input-id="`field-${field.id}`"
              :field-id="field.id"
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
          Photos
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
              :aria-label="`Delete photo ${photo.filename}`"
              @click="removePhoto(photo.id)"
            >
              ×
            </button>
          </div>
        </div>
        <input
          class="form-control"
          type="file"
          aria-label="Add photos"
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
          <span v-if="photos.length">{{ photos.length }} photo{{ photos.length === 1 ? '' : 's' }} ready to upload. Choose files to replace the selection. </span>
          Up to 10 images, 15 MB each.
        </div>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="router.back()"
        >
          Cancel
        </button><button
          class="btn btn-primary"
          :disabled="saving || !categories.length"
        >
          {{ saving ? 'Saving…' : 'Save item' }}
        </button>
      </div>
    </form>
  </div>
</template>
