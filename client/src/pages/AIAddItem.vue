<script setup>
import { onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../api.js';
import { setPendingAiDraft } from '../aiDraft.js';
import PageHeader from '../components/PageHeader.vue';

const router = useRouter();
const image = ref(null);
const hint = ref('');
const previewUrl = ref('');
const error = ref('');
const analyzing = ref(false);

function selectImage(event) {
  image.value = event.target.files?.[0] || null;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = image.value ? URL.createObjectURL(image.value) : '';
}

async function analyze() {
  if (!image.value) { error.value = 'Choose an image to analyze.'; return; }
  analyzing.value = true; error.value = '';
  try {
    const data = new FormData();
    data.append('image', image.value);
    if (hint.value.trim()) data.append('hint', hint.value.trim());
    const draft = await api('/api/ai/items/analyze', { method: 'POST', body: data });
    setPendingAiDraft(draft, image.value);
    await router.push('/items/new');
  } catch (caught) {
    error.value = caught.message;
  } finally {
    analyzing.value = false;
  }
}

onBeforeUnmount(() => { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); });
</script>

<template>
  <div class="form-card">
    <PageHeader
      title="AI Add Item"
      subtitle="Analyze one photo, then review every suggestion in the normal Add Item form."
    />
    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <form
      class="card"
      @submit.prevent="analyze"
    >
      <div class="card-body">
        <div class="mb-3">
          <label
            class="form-label"
            for="ai-item-image"
          >Item photo *</label>
          <input
            id="ai-item-image"
            class="form-control"
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            required
            @change="selectImage"
          >
          <div class="form-text">
            JPEG, PNG, WebP, or GIF; up to 15 MB. The original photo is kept for the item.
          </div>
        </div>
        <img
          v-if="previewUrl"
          :src="previewUrl"
          alt="Selected item preview"
          class="img-thumbnail mb-3 app-ai-preview"
        >
        <div class="mb-3">
          <label
            class="form-label"
            for="ai-item-hint"
          >Additional description</label>
          <textarea
            id="ai-item-hint"
            v-model="hint"
            class="form-control"
            rows="3"
            maxlength="2000"
            placeholder="For example: Old NVIDIA graphics card. I think it is a RIVA TNT2."
          />
          <div class="form-text">
            Optional context only. Visible information in the photo takes priority.
          </div>
        </div>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
        <RouterLink
          to="/items"
          class="btn btn-outline-secondary"
        >
          Cancel
        </RouterLink>
        <button
          class="btn btn-primary"
          :disabled="analyzing || !image"
        >
          <span
            v-if="analyzing"
            class="spinner-border spinner-border-sm me-1"
            aria-hidden="true"
          />
          {{ analyzing ? 'Analyzing…' : 'Analyze' }}
        </button>
      </div>
    </form>
  </div>
</template>
