<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import { api } from '../api.js';

// Chooses the template the Add Item form is prefilled from. Nothing is created here.
const emit = defineEmits(['close']);

const templates = ref(null);
const error = ref('');
const closeButton = ref(null);

const onKeydown = event => { if (event.key === 'Escape') emit('close'); };
onMounted(async () => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => closeButton.value?.focus());
  try { templates.value = await api('/api/item-templates'); } catch (e) { error.value = e.message; }
});
onBeforeUnmount(() => {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <div
    class="modal modal-blur d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="template-picker-title"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h2
            id="template-picker-title"
            class="modal-title"
          >
            {{ $t('templates.pickTitle') }}
          </h2>
          <button
            ref="closeButton"
            type="button"
            class="btn-close"
            :aria-label="$t('common.close')"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body">
          <div
            v-if="error"
            class="alert alert-danger"
            role="alert"
          >
            {{ error }}
          </div>
          <div
            v-else-if="!templates"
            class="d-flex align-items-center gap-2 text-secondary"
          >
            <span
              class="spinner-border spinner-border-sm"
              aria-hidden="true"
            />
            {{ $t('templates.loading') }}
          </div>
          <p
            v-else-if="!templates.length"
            class="text-secondary mb-0"
          >
            {{ $t('templates.emptyText') }}
          </p>
          <div
            v-else
            class="list-group"
          >
            <template
              v-for="template in templates"
              :key="template.id"
            >
              <RouterLink
                v-if="template.category_id"
                :to="{ path: '/items/new', query: { template: template.id } }"
                class="list-group-item list-group-item-action d-flex justify-content-between gap-2"
              >
                <span class="text-break">{{ template.name }}</span>
                <small class="text-secondary text-break">{{ template.category_name }}</small>
              </RouterLink>
              <div
                v-else
                class="list-group-item disabled d-flex justify-content-between gap-2"
                aria-disabled="true"
              >
                <span class="text-break">{{ template.name }}</span>
                <span class="badge bg-warning-lt">{{ $t('templates.categoryMissing') }}</span>
              </div>
            </template>
          </div>
        </div>
        <div class="modal-footer">
          <RouterLink
            to="/templates"
            class="btn me-auto"
          >
            {{ $t('templates.manage') }}
          </RouterLink>
          <button
            type="button"
            class="btn"
            @click="emit('close')"
          >
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
