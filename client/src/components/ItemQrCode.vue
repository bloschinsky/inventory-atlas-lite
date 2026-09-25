<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import qrcode from 'qrcode-generator';
import { encodeItemQrPayload } from '../../../shared/itemQr.js';

const props = defineProps({ uuid: { type: String, required: true } });
const { t } = useI18n();

// Quiet zone required around a QR code, expressed in modules like the code itself.
const MARGIN = 4;

/*
  The code is generated locally from the canonical payload and drawn as one SVG path, so the same
  component serves the details modal and later print labels without any image being stored or fetched.
*/
const code = computed(() => {
  try {
    const payload = encodeItemQrPayload(props.uuid);
    const qr = qrcode(0, 'M');
    qr.addData(payload);
    qr.make();
    const count = qr.getModuleCount();
    let path = '';
    for (let row = 0; row < count; row++) {
      for (let column = 0; column < count; column++) {
        if (qr.isDark(row, column)) path += `M${column + MARGIN} ${row + MARGIN}h1v1h-1z`;
      }
    }
    return { payload, path, size: count + MARGIN * 2, error: '' };
  } catch (generationError) {
    return { error: t('qr.generationFailed', { reason: generationError.message }) };
  }
});
</script>

<template>
  <div
    v-if="code.error"
    class="alert alert-danger mb-0"
    role="alert"
  >
    {{ code.error }}
  </div>
  <!-- Fixed black on white in both colour modes: a scanner needs the contrast, not the theme. -->
  <svg
    v-else
    class="item-qr-code"
    role="img"
    :aria-label="$t('qr.codeFor', { payload: code.payload })"
    :viewBox="`0 0 ${code.size} ${code.size}`"
    xmlns="http://www.w3.org/2000/svg"
  >
    <rect
      width="100%"
      height="100%"
      fill="#ffffff"
    />
    <path
      :d="code.path"
      fill="#000000"
    />
  </svg>
</template>
