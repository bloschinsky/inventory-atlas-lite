<script setup>
import { computed, ref, watch } from 'vue';
import { IconCheck } from '@tabler/icons-vue';
import ColorValue from './ColorValue.vue';
import { COLOR_PRESETS, CUSTOM_COLOR, colorLabelKey, contrastColor, storedColor } from '../colors.js';
import { customColor, encodeColor, normalizeHex, presetColor } from '../../../shared/colors.js';

/*
  The Color field input of the item form, the template editor, and Batch Add Items. The model is the
  stored text: '' while no color is chosen, otherwise the canonical JSON of { key, hex }. Nothing is
  chosen until the user picks a preset or a valid custom HEX, so opening Custom alone stores no color.
  The swatches are native radio inputs, so Tab enters the group and the arrow keys move inside it.
*/
const props = defineProps({
  // Unique per picker on the page; it groups the radio inputs.
  name: { type: String, required: true },
  // The id of the element that names the field.
  labelledby: { type: String, required: true },
  invalid: { type: Boolean, default: false }
});
const model = defineModel({ type: String, default: '' });

const selected = computed(() => storedColor(model.value));
const customMode = ref(false);
const customText = ref('');
// Where the native color input starts when Custom is opened: the last chosen color, or a mid gray.
const startHex = ref('#808080');

const withHash = text => (text.startsWith('#') ? text : `#${text}`);

const syncFromModel = () => {
  if (selected.value?.key === CUSTOM_COLOR) {
    customMode.value = true;
    if (normalizeHex(withHash(customText.value)) !== selected.value.hex) customText.value = selected.value.hex;
  } else if (selected.value) customMode.value = false;
};
watch(model, syncFromModel, { immediate: true });

const choice = computed(() => (customMode.value ? CUSTOM_COLOR : selected.value?.key ?? ''));
const customHex = computed(() => normalizeHex(withHash(customText.value.trim())));
const nativeValue = computed(() => (customHex.value ?? startHex.value).toLowerCase());
const customSwatch = computed(() => (customMode.value && customHex.value) || null);

function choosePreset(key) {
  customMode.value = false;
  model.value = encodeColor(presetColor(key));
}
function chooseCustom() {
  if (selected.value) startHex.value = selected.value.hex;
  customMode.value = true;
  model.value = customHex.value ? encodeColor(customColor(customHex.value)) : '';
}
function typeCustom(text) {
  customText.value = text;
  model.value = customHex.value ? encodeColor(customColor(customHex.value)) : '';
}
function clear() {
  customMode.value = false;
  customText.value = '';
  model.value = '';
}
</script>

<template>
  <div
    class="color-picker"
    :class="{ 'is-invalid': props.invalid }"
  >
    <div
      class="color-picker-grid"
      role="radiogroup"
      :aria-labelledby="labelledby"
    >
      <label
        v-for="preset in COLOR_PRESETS"
        :key="preset.key"
        class="color-option"
        :class="{ active: choice === preset.key }"
      >
        <input
          type="radio"
          class="color-option-input visually-hidden"
          :name="name"
          :value="preset.key"
          :checked="choice === preset.key"
          @change="choosePreset(preset.key)"
        >
        <span
          class="color-option-swatch"
          :style="{ backgroundColor: preset.hex, color: contrastColor(preset.hex) }"
          aria-hidden="true"
        >
          <IconCheck
            v-if="choice === preset.key"
            :size="18"
            :stroke-width="3"
          />
        </span>
        <span class="color-option-name">{{ $t(colorLabelKey(preset.key)) }}</span>
      </label>
      <label
        class="color-option"
        :class="{ active: choice === CUSTOM_COLOR }"
      >
        <input
          type="radio"
          class="color-option-input visually-hidden"
          :name="name"
          :value="CUSTOM_COLOR"
          :checked="choice === CUSTOM_COLOR"
          @change="chooseCustom"
        >
        <span
          class="color-option-swatch"
          :class="{ 'color-option-swatch-custom': !customSwatch }"
          :style="customSwatch ? { backgroundColor: customSwatch, color: contrastColor(customSwatch) } : undefined"
          aria-hidden="true"
        >
          <IconCheck
            v-if="choice === CUSTOM_COLOR"
            :size="18"
            :stroke-width="3"
          />
        </span>
        <span class="color-option-name">{{ $t('colors.customOption') }}</span>
      </label>
    </div>
    <div
      v-if="customMode"
      class="d-flex gap-2 align-items-start mt-2"
    >
      <input
        type="color"
        class="form-control form-control-color flex-shrink-0"
        :value="nativeValue"
        :aria-label="$t('colors.customPicker')"
        @input="typeCustom($event.target.value.toUpperCase())"
      >
      <div class="flex-grow-1">
        <input
          type="text"
          class="form-control font-monospace"
          :class="{ 'is-invalid': customText.trim() && !customHex }"
          :value="customText"
          :aria-label="$t('colors.customHex')"
          placeholder="#RRGGBB"
          maxlength="7"
          autocomplete="off"
          spellcheck="false"
          @input="typeCustom($event.target.value)"
        >
        <div class="invalid-feedback">
          {{ $t('colors.invalidHex') }}
        </div>
      </div>
    </div>
    <div class="d-flex align-items-center gap-2 mt-2">
      <span
        class="text-secondary small"
        aria-live="polite"
      >
        <template v-if="selected">
          {{ $t('colors.selected') }} <ColorValue
            :value="model"
            show-hex
          />
        </template>
        <template v-else-if="customMode">{{ $t('colors.chooseCustom') }}</template>
        <template v-else>{{ $t('colors.notSet') }}</template>
      </span>
      <button
        type="button"
        class="btn btn-sm btn-ghost-secondary ms-auto"
        :disabled="!selected && !customMode"
        @click="clear"
      >
        {{ $t('colors.clear') }}
      </button>
    </div>
  </div>
</template>
