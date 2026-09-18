<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api } from '../api.js';
import ItemPhotoViewer from '../components/ItemPhotoViewer.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';

const route = useRoute(); const router = useRouter();
const item = ref(null); const error = ref('');
const formatDate = value => value ? new Date(value.replace(' ', 'T') + 'Z').toLocaleString() : '—';
const displayValue = field => field.type === 'boolean' ? (field.value === '1' ? 'Yes' : 'No') : (field.value || '—');
// An item with neither a container nor contents would only produce an empty storage card.
const hasStorage = computed(() => Boolean(item.value?.parent || item.value?.children.length));

async function load() { try { item.value = await api(`/api/items/${route.params.id}`); } catch (e) { error.value = e.message; } }
async function remove() {
  if (!confirm(`Delete “${item.value.name}” and its photos?`)) return;
  try { await api(`/api/items/${item.value.id}`, { method: 'DELETE' }); router.push('/'); } catch (e) { error.value = e.message; }
}
async function removePhoto(id) {
  if (!confirm('Delete this photo?')) return;
  try { await api(`/api/photos/${id}`, { method: 'DELETE' }); await load(); } catch (e) { error.value = e.message; }
}
// The same component serves every /items/:id, so parent and contents links must reload it.
watch(() => route.params.id, load);
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
  <div
    v-else-if="!item"
    class="card"
  >
    <div class="card-body d-flex align-items-center gap-2 text-secondary">
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      Loading item…
    </div>
  </div>
  <template v-else>
    <!-- The heading block stays first in the DOM so the name precedes the photo on phones. -->
    <div class="page-header mb-3">
      <div class="row g-2 align-items-center">
        <div class="col min-w-0">
          <ol class="breadcrumb page-pretitle mb-1">
            <li class="breadcrumb-item">
              <RouterLink to="/">
                All items
              </RouterLink>
            </li>
            <li
              class="breadcrumb-item active"
              aria-current="page"
            >
              {{ item.category_name }}
            </li>
          </ol>
          <h1 class="page-title text-break">
            {{ item.name }}
          </h1>
        </div>
        <div class="col-auto ms-auto d-flex flex-wrap gap-2">
          <RouterLink
            :to="`/items/${item.id}/edit`"
            class="btn btn-primary"
          >
            Edit
          </RouterLink>
          <button
            type="button"
            class="btn btn-outline-danger"
            @click="remove"
          >
            Delete
          </button>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-5">
        <ItemPhotoViewer
          :photos="item.photos"
          @delete="removePhoto"
        />
      </div>
      <div class="col-12 col-lg-7 d-grid gap-4">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              Details
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-4">
                Condition
              </dt>
              <dd class="col-sm-8 text-break">
                {{ item.condition || '—' }}
              </dd>
              <dt class="col-sm-4">
                Location
              </dt>
              <dd class="col-sm-8 text-break">
                {{ item.location || '—' }}
              </dd>
              <dt class="col-sm-4">
                Description
              </dt>
              <dd class="col-sm-8 text-break mb-0">
                {{ item.description || '—' }}
              </dd>
            </dl>
          </div>
        </section>

        <section
          v-if="item.fields.length"
          class="card"
        >
          <div class="card-header">
            <h2 class="card-title">
              {{ item.category_name }} fields
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <template
                v-for="(field, index) in item.fields"
                :key="field.id"
              >
                <dt class="col-sm-4">
                  {{ field.name }}
                </dt>
                <dd
                  class="col-sm-8 text-break"
                  :class="{ 'mb-0': index === item.fields.length - 1 }"
                >
                  {{ displayValue(field) }}
                </dd>
              </template>
            </dl>
          </div>
        </section>

        <section
          v-if="hasStorage"
          class="card"
        >
          <div class="card-header">
            <h2 class="card-title">
              Storage
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-4">
                Stored inside
              </dt>
              <dd class="col-sm-8 text-break mb-0">
                <RouterLink
                  v-if="item.parent"
                  :to="`/items/${item.parent.id}`"
                >
                  {{ item.parent.name }}
                </RouterLink>
                <template v-else>
                  —
                </template>
              </dd>
            </dl>
          </div>
          <template v-if="item.children.length">
            <div class="card-header border-top">
              <h3 class="card-title">
                Contents
              </h3>
            </div>
            <ul class="list-group list-group-flush">
              <li
                v-for="child in item.children"
                :key="child.id"
                class="list-group-item d-flex align-items-center gap-3"
              >
                <ItemThumbnail
                  :photo-id="child.thumbnail_id"
                  :name="child.name"
                />
                <div class="min-w-0">
                  <RouterLink
                    :to="`/items/${child.id}`"
                    class="item-card-link"
                  >
                    {{ child.name }}
                  </RouterLink>
                  <p class="meta-text mb-0">
                    {{ child.category_name }}<template v-if="child.condition">
                      · {{ child.condition }}
                    </template>
                  </p>
                </div>
              </li>
            </ul>
          </template>
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              Record information
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0 meta-text">
              <dt class="col-sm-4">
                UUID
              </dt>
              <dd class="col-sm-8 text-break">
                {{ item.uuid }}
              </dd>
              <dt class="col-sm-4">
                Created
              </dt>
              <dd class="col-sm-8">
                {{ formatDate(item.created_at) }}
              </dd>
              <dt class="col-sm-4">
                Updated
              </dt>
              <dd class="col-sm-8 mb-0">
                {{ formatDate(item.updated_at) }}
              </dd>
            </dl>
          </div>
        </section>
      </div>
    </div>
  </template>
</template>
