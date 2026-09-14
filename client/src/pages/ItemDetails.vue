<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
const route = useRoute(); const router = useRouter();
const item = ref(null); const error = ref('');
const formatDate = value => value ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString() : '—';
const displayValue = field => field.type === 'boolean' ? (field.value === '1' ? 'Yes' : 'No') : (field.value || '—');
async function load() { try { item.value = await api(`/api/items/${route.params.id}`); } catch (e) { error.value = e.message; } }
async function remove() {
  if (!confirm(`Delete “${item.value.name}” and its photos?`)) return;
  try { await api(`/api/items/${item.value.id}`, { method: 'DELETE' }); router.push('/'); } catch (e) { error.value = e.message; }
}
async function removePhoto(id) { if (confirm('Delete this photo?')) { await api(`/api/photos/${id}`, { method: 'DELETE' }); await load(); } }
// The same component serves every /items/:id, so parent and contents links must reload it.
watch(() => route.params.id, load);
onMounted(load);
</script>
<template>
  <div
    v-if="error"
    class="alert alert-danger"
  >
    {{ error }}
  </div>
  <div
    v-else-if="!item"
    class="text-secondary"
  >
    Loading…
  </div>
  <template v-else>
    <div class="d-flex justify-content-between align-items-start mb-3">
      <div>
        <div class="text-secondary">
          {{ item.category_name }}
        </div><h1 class="h3">
          {{ item.name }}
        </h1>
      </div>
      <div class="d-flex gap-2">
        <RouterLink
          :to="`/items/${item.id}/edit`"
          class="btn btn-primary"
        >
          Edit
        </RouterLink><button
          class="btn btn-outline-danger"
          @click="remove"
        >
          Delete
        </button>
      </div>
    </div>
    <div class="row g-4">
      <div class="col-lg-7">
        <div class="card mb-4">
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-4">
                Condition
              </dt><dd class="col-sm-8">
                {{ item.condition || '—' }}
              </dd>
              <dt class="col-sm-4">
                Location
              </dt><dd class="col-sm-8">
                {{ item.location || '—' }}
              </dd>
              <dt class="col-sm-4">
                Stored inside
              </dt><dd class="col-sm-8">
                <RouterLink
                  v-if="item.parent"
                  :to="`/items/${item.parent.id}`"
                >
                  {{ item.parent.name }}
                </RouterLink><template v-else>
                  —
                </template>
              </dd>
              <dt class="col-sm-4">
                Description
              </dt><dd class="col-sm-8 text-break">
                {{ item.description || '—' }}
              </dd>
              <template
                v-for="field in item.fields"
                :key="field.id"
              >
                <dt class="col-sm-4">
                  {{ field.name }}
                </dt><dd class="col-sm-8">
                  {{ displayValue(field) }}
                </dd>
              </template>
            </dl>
          </div>
        </div>
        <h2 class="h5">
          Contents
        </h2>
        <div
          v-if="!item.children.length"
          class="text-secondary mb-4"
        >
          No items stored inside.
        </div>
        <div
          v-for="child in item.children"
          :key="child.id"
          class="card mb-2"
        >
          <div class="card-body py-2 d-flex align-items-center gap-3">
            <img
              v-if="child.thumbnail_id"
              class="thumbnail"
              :src="`/api/photos/${child.thumbnail_id}`"
              :alt="child.name"
            ><div
              v-else
              class="thumbnail empty-thumb"
            >
              No photo
            </div>
            <div>
              <RouterLink :to="`/items/${child.id}`">
                {{ child.name }}
              </RouterLink><div class="small text-secondary">
                {{ child.category_name }}<template v-if="child.condition">
                  · {{ child.condition }}
                </template>
              </div>
            </div>
          </div>
        </div>
        <div class="small text-secondary mt-4">
          UUID: {{ item.uuid }}<br>Created: {{ formatDate(item.created_at) }}<br>Updated: {{ formatDate(item.updated_at) }}
        </div>
      </div>
      <div class="col-lg-5">
        <h2 class="h5">
          Photos
        </h2><div
          v-if="!item.photos.length"
          class="text-secondary"
        >
          No photos.
        </div>
        <div
          v-for="photo in item.photos"
          :key="photo.id"
          class="card mb-3"
        >
          <img
            class="photo-large card-img-top"
            :src="`/api/photos/${photo.id}`"
            :alt="photo.filename"
          ><div class="card-body py-2 d-flex justify-content-between">
            <small class="text-truncate">{{ photo.filename }}</small><button
              class="btn btn-link text-danger btn-sm p-0"
              @click="removePhoto(photo.id)"
            >
              Delete
            </button>
          </div>
        </div>
      </div>
    </div>
  </template>
</template>
