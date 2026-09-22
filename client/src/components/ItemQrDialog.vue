<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import ItemQrCode from './ItemQrCode.vue';
import { encodeItemQrPayload } from '../../../shared/itemQr.js';

const props = defineProps({ item: { type: Object, required: true } });
const emit = defineEmits(['close']);

const closeButton = ref(null);
// Debug line under the code; an unusable UUID is already reported by the code itself.
const payload = (() => {
  try {
    return encodeItemQrPayload(props.item.uuid);
  } catch {
    return props.item.uuid;
  }
})();

const onKeydown = event => { if (event.key === 'Escape') emit('close'); };
onMounted(() => {
  document.body.classList.add('modal-open');
  document.addEventListener('keydown', onKeydown);
  nextTick(() => closeButton.value?.focus());
});
onBeforeUnmount(() => {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <!-- Bootstrap's modal markup driven by Vue state, like the other dialogs: no Bootstrap JavaScript. -->
  <div
    class="modal modal-blur d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="item-qr-title"
    @click.self="emit('close')"
  >
    <div class="modal-dialog modal-sm modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header">
          <h2
            id="item-qr-title"
            class="modal-title"
          >
            QR Code
          </h2>
          <button
            ref="closeButton"
            type="button"
            class="btn-close"
            aria-label="Close QR code"
            @click="emit('close')"
          />
        </div>
        <div class="modal-body text-center">
          <ItemQrCode :uuid="item.uuid" />
          <p class="h3 mt-3 mb-1 text-break">
            {{ item.name }}
          </p>
          <p class="meta-text text-break mb-0">
            {{ payload }}
          </p>
        </div>
        <div class="modal-footer">
          <button
            type="button"
            class="btn w-100"
            @click="emit('close')"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  </div>
  <div class="modal-backdrop show" />
</template>
