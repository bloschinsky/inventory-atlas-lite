<script setup>
import { computed, onBeforeUnmount, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api, apiBlob } from '../api.js';
import { setPendingAiDraft } from '../aiDraft.js';
import { capabilities } from '../capabilities.js';
import PageHeader from '../components/PageHeader.vue';

const router = useRouter();
const { t } = useI18n();
const image = ref(null);
const description = ref('');
const removeBackground = ref(false);
const previewUrl = ref('');
const error = ref('');
const creating = ref(false);

const canSubmit = computed(() => Boolean(image.value) || Boolean(description.value.trim()));

function selectImage(event) {
  image.value = event.target.files?.[0] || null;
  if (previewUrl.value) URL.revokeObjectURL(previewUrl.value);
  previewUrl.value = image.value ? URL.createObjectURL(image.value) : '';
}

async function createDraft() {
  if (!canSubmit.value) { error.value = t('aiAddItem.inputRequired'); return; }
  creating.value = true; error.value = '';
  try {
    const data = new FormData();
    if (image.value) data.append('image', image.value);
    if (description.value.trim()) data.append('description', description.value.trim());
    const analysis = api('/api/ai/items/analyze', { method: 'POST', body: data });
    // Background removal only concerns the proposed inventory photo, so it runs only with one.
    let background = Promise.resolve(null);
    if (image.value && removeBackground.value) {
      const photoData = new FormData();
      photoData.append('image', image.value);
      background = apiBlob('/api/images/remove-background', { method: 'POST', body: photoData });
    }
    const [analysisResult, backgroundResult] = await Promise.allSettled([analysis, background]);
    if (analysisResult.status === 'rejected') throw analysisResult.reason;
    let finalPhoto = image.value;
    let photoWarning = '';
    if (image.value && removeBackground.value) {
      if (backgroundResult.status === 'fulfilled') {
        const originalName = image.value.name.replace(/\.[^.]+$/, '') || 'item';
        finalPhoto = new File([backgroundResult.value], `${originalName}-background-removed.jpg`, { type: 'image/jpeg' });
      } else {
        photoWarning = t('aiAddItem.backgroundFailed');
      }
    }
    setPendingAiDraft(analysisResult.value, finalPhoto, photoWarning);
    await router.push('/items/new');
  } catch (caught) {
    error.value = caught.message;
  } finally {
    creating.value = false;
  }
}

onBeforeUnmount(() => { if (previewUrl.value) URL.revokeObjectURL(previewUrl.value); });
</script>

<template>
  <div class="form-card">
    <PageHeader
      :title="$t('aiAddItem.title')"
      :subtitle="$t('aiAddItem.subtitle')"
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
      @submit.prevent="createDraft"
    >
      <div class="card-body">
        <div
          v-if="!capabilities.ai.imageInput"
          class="alert alert-info"
          role="status"
        >
          {{ $t('aiAddItem.textOnly') }}
        </div>
        <template v-else>
          <div class="mb-3">
            <label
              class="form-label"
              for="ai-item-image"
            >{{ $t('aiAddItem.photo') }}</label>
            <input
              id="ai-item-image"
              class="form-control"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              @change="selectImage"
            >
            <div class="form-text">
              {{ $t('aiAddItem.photoHelp') }}
            </div>
          </div>
          <img
            v-if="previewUrl"
            :src="previewUrl"
            :alt="$t('aiAddItem.preview')"
            class="img-thumbnail mb-3 app-ai-preview"
          >
          <template v-if="image">
            <label class="form-check mb-2">
              <input
                v-model="removeBackground"
                class="form-check-input"
                type="checkbox"
              >
              <span class="form-check-label">{{ $t('aiAddItem.removeBackground') }}</span>
            </label>
            <div class="form-text mb-3">
              {{ $t('aiAddItem.removeBackgroundHelp') }}
            </div>
          </template>
        </template>
        <div class="mb-3">
          <label
            class="form-label"
            for="ai-item-description"
          >{{ $t('aiAddItem.description') }}</label>
          <textarea
            id="ai-item-description"
            v-model="description"
            class="form-control"
            rows="3"
            maxlength="2000"
            :placeholder="$t('aiAddItem.descriptionPlaceholder')"
          />
          <div class="form-text">
            {{ $t('aiAddItem.descriptionHelp') }}
          </div>
        </div>
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
        <RouterLink
          to="/items"
          class="btn btn-outline-secondary"
        >
          {{ $t('common.cancel') }}
        </RouterLink>
        <button
          class="btn btn-primary"
          :disabled="creating || !canSubmit"
        >
          <span
            v-if="creating"
            class="spinner-border spinner-border-sm me-1"
            aria-hidden="true"
          />
          {{ creating ? $t('aiAddItem.creating') : $t('aiAddItem.create') }}
        </button>
      </div>
    </form>
  </div>
</template>
