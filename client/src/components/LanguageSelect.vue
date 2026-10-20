<script setup>
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { AUTO_DETECT, COMMON_CONTENT_LANGUAGES, CONTENT_LANGUAGES, contentLanguageName } from '../../../shared/languages.js';

/*
  A content language picker: the common languages first, then every other listed language by name in
  the interface language. The search box narrows the list by any of a language's names (in the
  interface language, its own, or English) or its tag, and selects the first match, so a language can
  be found without scrolling. `auto` adds Auto-detect for a translation source.
*/
const props = defineProps({
  id: { type: String, required: true },
  label: { type: String, required: true },
  auto: { type: Boolean, default: false }
});
const model = defineModel({ type: String, required: true });
const { locale } = useI18n();
const query = ref('');

const languages = computed(() => CONTENT_LANGUAGES.map(tag => {
  const name = contentLanguageName(tag, locale.value);
  const terms = [name, contentLanguageName(tag, tag), contentLanguageName(tag, 'en'), tag].join('\n').toLocaleLowerCase();
  return { tag, label: `${name} (${tag})`, terms };
}));
const found = computed(() => {
  const search = query.value.trim().toLocaleLowerCase();
  return search ? languages.value.filter(language => language.terms.includes(search)) : languages.value;
});
// The chosen language stays offered whatever the search, so the select never shows a value it lacks.
const shown = computed(() => languages.value.filter(language => language.tag === model.value || found.value.includes(language)));
const common = computed(() => COMMON_CONTENT_LANGUAGES.map(tag => shown.value.find(language => language.tag === tag)).filter(Boolean));
const others = computed(() => shown.value.filter(language => !COMMON_CONTENT_LANGUAGES.includes(language.tag))
  .sort((a, b) => a.label.localeCompare(b.label, locale.value)));

watch(query, () => {
  if (query.value.trim() && found.value.length && !found.value.some(language => language.tag === model.value)) {
    model.value = found.value[0].tag;
  }
});
</script>

<template>
  <div>
    <input
      v-model="query"
      class="form-control mb-1"
      type="search"
      :aria-label="$t('translation.searchLanguages', { label: props.label })"
      :aria-controls="id"
      :placeholder="$t('translation.searchPlaceholder')"
    >
    <select
      :id="id"
      v-model="model"
      class="form-select"
    >
      <option
        v-if="auto"
        :value="AUTO_DETECT"
      >
        {{ $t('translation.autoDetect') }}
      </option>
      <optgroup
        v-if="common.length"
        :label="$t('translation.commonLanguages')"
      >
        <option
          v-for="language in common"
          :key="language.tag"
          :value="language.tag"
        >
          {{ language.label }}
        </option>
      </optgroup>
      <optgroup
        v-if="others.length"
        :label="$t('translation.allLanguages')"
      >
        <option
          v-for="language in others"
          :key="language.tag"
          :value="language.tag"
        >
          {{ language.label }}
        </option>
      </optgroup>
    </select>
  </div>
</template>
