<script setup>
import { computed, onMounted, reactive, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import ItemQrCode from '../components/ItemQrCode.vue';
import PageHeader from '../components/PageHeader.vue';
import { IconPrinter } from '@tabler/icons-vue';

/*
  Fixed A4 presets in physical units. Each one fits its grid inside a 210 x 297 mm sheet with room
  for printer margins, and gives the QR code a fixed size: text yields space, the code never does.
*/
const PRESETS = {
  large: { columns: 2, rows: 4, width: 95, height: 69, padding: 4, qr: 45, font: 10, nameLines: 3, textLines: 4 },
  standard: { columns: 3, rows: 7, width: 63, height: 39, padding: 2.5, qr: 30, font: 8, nameLines: 2, textLines: 3 },
  compact: { columns: 3, rows: 10, width: 63, height: 27, padding: 2.5, qr: 22, font: 6.5, nameLines: 2, textLines: 2 }
};

// Their labels are the translation keys labels.show.<key>.
const METADATA = ['name', 'description', 'category', 'location'].map(key => ({ key }));

const { t } = useI18n();

// The UUIDs arrive through history state (see labelSelection.js), which also survives a reload.
const uuids = Array.isArray(window.history.state?.uuids) ? window.history.state.uuids : [];
const labels = ref([]);
const missing = ref([]);
const loading = ref(uuids.length > 0);
const error = ref('');
const presetKey = ref('standard');
const show = reactive({ name: true, description: true, category: false, location: false });

const preset = computed(() => PRESETS[presetKey.value]);
const showsText = computed(() => METADATA.some(({ key }) => show[key]));
const sheetStyle = computed(() => {
  const { columns, rows, width, height, padding, qr, font, nameLines, textLines } = preset.value;
  return {
    '--label-columns': columns,
    '--label-rows': rows,
    '--label-width': `${width}mm`,
    '--label-height': `${height}mm`,
    '--label-padding': `${padding}mm`,
    '--label-qr': `${qr}mm`,
    '--label-font': `${font}pt`,
    '--label-name-lines': nameLines,
    '--label-text-lines': textLines
  };
});
const sheets = computed(() => {
  const perSheet = preset.value.columns * preset.value.rows;
  const result = [];
  for (let start = 0; start < labels.value.length; start += perSheet) result.push(labels.value.slice(start, start + perSheet));
  return result;
});
const summary = computed(() => t('labels.summary', {
  labels: t('labels.labelCount', labels.value.length),
  pages: t('labels.pageCount', sheets.value.length)
}));

const print = () => window.print();

onMounted(async () => {
  if (!uuids.length) return;
  try {
    const result = await api('/api/items/labels', jsonOptions('POST', { uuids }));
    labels.value = result.items;
    missing.value = result.missing;
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <PageHeader
    :title="$t('labels.title')"
    :subtitle="$t('labels.itemsSelected', uuids.length)"
  >
    <template #actions>
      <RouterLink
        to="/items"
        class="btn"
      >
        {{ $t('labels.back') }}
      </RouterLink>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="!labels.length"
        @click="print"
      >
        <IconPrinter
          :size="18"
          aria-hidden="true"
        />
        {{ $t('labels.print') }}
      </button>
    </template>
  </PageHeader>

  <div
    v-if="!uuids.length"
    class="card"
  >
    <div class="empty">
      <p class="empty-title">
        {{ $t('labels.noSelection') }}
      </p>
      <p class="empty-subtitle text-secondary">
        {{ $t('labels.noSelectionText') }}
      </p>
      <div class="empty-action">
        <RouterLink
          to="/items"
          class="btn btn-primary"
        >
          {{ $t('labels.goToItems') }}
        </RouterLink>
      </div>
    </div>
  </div>

  <template v-else>
    <div
      v-if="error"
      class="alert alert-danger d-print-none"
      role="alert"
    >
      {{ error }}
    </div>
    <div
      v-if="missing.length"
      class="alert alert-warning d-print-none"
      role="alert"
    >
      {{ $t('labels.missing', missing.length) }}
    </div>

    <div
      v-if="loading"
      class="card d-print-none"
    >
      <div class="card-body d-flex align-items-center gap-2 text-secondary">
        <span
          class="spinner-border spinner-border-sm"
          aria-hidden="true"
        />
        {{ $t('labels.loading') }}
      </div>
    </div>

    <template v-else-if="labels.length">
      <div class="card mb-3 d-print-none">
        <div class="card-body row g-3 align-items-end">
          <div class="col-12 col-sm-4 col-lg-3">
            <label
              class="form-label"
              for="labels-layout"
            >{{ $t('labels.layout') }}</label>
            <select
              id="labels-layout"
              v-model="presetKey"
              class="form-select"
            >
              <option
                v-for="(option, key) in PRESETS"
                :key="key"
                :value="key"
              >
                {{ $t(`labels.presets.${key}`, { n: option.columns * option.rows }) }}
              </option>
            </select>
          </div>
          <fieldset class="col-12 col-sm-8 col-lg-6">
            <legend class="form-label">
              {{ $t('labels.showOnLabels') }}
            </legend>
            <label class="form-check form-check-inline">
              <input
                type="checkbox"
                class="form-check-input"
                checked
                disabled
              >
              <span class="form-check-label">{{ $t('qr.title') }}</span>
            </label>
            <label
              v-for="field in METADATA"
              :key="field.key"
              class="form-check form-check-inline"
            >
              <input
                v-model="show[field.key]"
                type="checkbox"
                class="form-check-input"
              >
              <span class="form-check-label">{{ $t(`labels.show.${field.key}`) }}</span>
            </label>
          </fieldset>
          <div
            class="col-12 col-lg-3 text-lg-end meta-text"
            aria-live="polite"
          >
            {{ summary }}
          </div>
        </div>
      </div>

      <!-- The preview is the printed output itself: the print styles only remove the page around it. -->
      <div
        class="label-sheets"
        :style="sheetStyle"
      >
        <section
          v-for="(sheet, index) in sheets"
          :key="`${presetKey}-${index}`"
          class="label-sheet"
          :aria-label="$t('labels.sheet', { page: index + 1, pages: sheets.length })"
        >
          <div
            v-for="item in sheet"
            :key="item.uuid"
            class="print-label"
            :class="{ 'print-label-qr-only': !showsText }"
            role="group"
            :aria-label="$t('labels.label', { name: item.name })"
          >
            <ItemQrCode :uuid="item.uuid" />
            <div
              v-if="showsText"
              class="print-label-text"
            >
              <p
                v-if="show.name"
                class="print-label-name print-label-clamp"
              >
                {{ item.name }}
              </p>
              <p
                v-if="show.description && item.description"
                class="print-label-description print-label-clamp"
              >
                {{ item.description }}
              </p>
              <p
                v-if="show.category"
                class="print-label-line"
              >
                {{ item.category_name }}
              </p>
              <p
                v-if="show.location && item.effective_location"
                class="print-label-line"
              >
                {{ item.effective_location }}
              </p>
            </div>
          </div>
        </section>
      </div>
    </template>

    <div
      v-else-if="!error"
      class="card"
    >
      <div class="empty">
        <p class="empty-title">
          {{ $t('labels.nothing') }}
        </p>
        <p class="empty-subtitle text-secondary">
          {{ $t('labels.nothingText') }}
        </p>
      </div>
    </div>
  </template>
</template>
