<script setup>
import { onMounted, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { api } from '../api.js';
import ItemHistoryTimeline from '../components/ItemHistoryTimeline.vue';

// /items/:id/history: the whole activity timeline of one item, with its filter and Load more.
const route = useRoute();
const item = ref(null);
const error = ref('');

async function load() {
  try { item.value = await api(`/api/items/${route.params.id}`); } catch (e) { error.value = e.message; }
}
watch(() => route.params.id, load);
onMounted(load);
</script>

<template>
  <div class="form-card">
    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <template v-else-if="item">
      <div class="page-header mb-3">
        <ol class="breadcrumb page-pretitle mb-1">
          <li class="breadcrumb-item">
            <RouterLink :to="`/items/${item.id}`">
              {{ item.name }}
            </RouterLink>
          </li>
        </ol>
        <h1 class="page-title">
          {{ $t('history.title') }}
        </h1>
      </div>
      <section class="card">
        <div class="card-body">
          <ItemHistoryTimeline :item-id="item.id" />
        </div>
      </section>
      <RouterLink
        :to="`/items/${item.id}`"
        class="btn btn-link px-0 mt-2"
      >
        {{ $t('history.backToItem') }}
      </RouterLink>
    </template>
  </div>
</template>
