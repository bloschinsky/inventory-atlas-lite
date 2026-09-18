<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, jsonOptions } from '../api.js';
import FieldAutocomplete from '../components/FieldAutocomplete.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';
import PageHeader from '../components/PageHeader.vue';

const route = useRoute(); const router = useRouter();
const editing = computed(() => Boolean(route.params.id));
const categories = ref([]); const fields = ref([]); const existingPhotos = ref([]); const photos = ref([]);
const error = ref(''); const saving = ref(false); const initialized = ref(false);
const form = reactive({ name: '', category_id: '', description: '', condition: '', location: '', parent_item_id: null, field_values: {} });
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
      Object.assign(form, { name: item.name, category_id: item.category_id, description: item.description || '', condition: item.condition || '', location: item.location || '', parent_item_id: item.parent_item_id });
      itemId.value = item.id; parent.value = item.parent;
      for (const field of item.fields) form.field_values[field.id] = field.value ?? (field.type === 'boolean' ? '0' : '');
      existingPhotos.value = item.photos;
      await loadFields(item.category_id);
    }
    initialized.value = true;
  } catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="form-card">
    <PageHeader :title="editing ? 'Edit item' : 'Add item'" />
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
        ><div class="form-text">
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
