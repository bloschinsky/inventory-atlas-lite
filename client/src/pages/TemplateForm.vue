<script setup>
import { computed, onMounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { api, jsonOptions } from '../api.js';
import ItemDraftFields from '../components/ItemDraftFields.vue';
import PageHeader from '../components/PageHeader.vue';
import { draftFromItem, draftFromTemplate, useItemDraftForm } from '../itemDraft.js';

/*
  Creates or edits an item template with the same fields as the item form. Every value is an optional
  default for future items. ?fromItem=<id> starts from an existing item; nothing is saved until the
  user saves the template.
*/
const route = useRoute(); const router = useRouter();
const editing = computed(() => Boolean(route.params.id));
const { form, categories, fields, start, fieldValues } = useItemDraftForm({ emptyBoolean: '' });
const templateName = ref('');
const sourceItem = ref(null);
const ignoredFieldCount = ref(0);
const categoryMissing = ref(false);
const error = ref(''); const saving = ref(false);

async function loadDraft() {
  if (editing.value) {
    const template = await api(`/api/item-templates/${route.params.id}`);
    templateName.value = template.name;
    ignoredFieldCount.value = template.ignored_field_count;
    categoryMissing.value = !template.category_id;
    return draftFromTemplate(template);
  }
  if (route.query.fromItem) {
    const item = await api(`/api/items/${encodeURIComponent(route.query.fromItem)}`);
    sourceItem.value = item;
    templateName.value = item.name;
    return draftFromItem(item);
  }
  return null;
}

async function save() {
  saving.value = true; error.value = '';
  try {
    const body = {
      ...form,
      name: templateName.value,
      item_name: form.name,
      field_values: fieldValues()
    };
    await api(editing.value ? `/api/item-templates/${route.params.id}` : '/api/item-templates',
      jsonOptions(editing.value ? 'PUT' : 'POST', body));
    router.push('/templates');
  } catch (e) { error.value = e.message; } finally { saving.value = false; }
}

onMounted(async () => {
  try { await start(await loadDraft()); } catch (e) { error.value = e.message; }
});
</script>

<template>
  <div class="form-card">
    <PageHeader :title="editing ? $t('templates.editTitle') : $t('templates.add')" />
    <div
      class="alert alert-info"
      role="status"
    >
      {{ $t('templates.defaultsNotice') }}
      <template v-if="sourceItem">
        {{ $t('templates.fromItemNotice', { name: sourceItem.name }) }}
      </template>
    </div>
    <div
      v-if="categoryMissing"
      class="alert alert-warning"
      role="alert"
    >
      {{ $t('templates.categoryMissingNotice') }}
    </div>
    <div
      v-if="ignoredFieldCount"
      class="alert alert-warning"
      role="alert"
    >
      {{ $t('templates.ignoredFields') }}
    </div>
    <div
      v-if="error"
      class="alert alert-danger"
      role="alert"
    >
      {{ error }}
    </div>
    <form
      class="card"
      @submit.prevent="save"
    >
      <div class="card-body">
        <div class="mb-3">
          <label
            class="form-label"
            for="template-name"
          >{{ $t('templates.name') }} *</label><input
            id="template-name"
            v-model="templateName"
            class="form-control"
            required
          >
          <div class="form-text">
            {{ $t('templates.nameHelp') }}
          </div>
        </div>
        <hr>
        <ItemDraftFields
          v-model:form="form"
          :categories="categories"
          :fields="fields"
          template
        />
      </div>
      <div class="card-footer d-flex flex-wrap gap-2 justify-content-end">
        <button
          type="button"
          class="btn btn-outline-secondary"
          @click="router.back()"
        >
          {{ $t('common.cancel') }}
        </button><button
          class="btn btn-primary"
          :disabled="saving || !categories.length"
        >
          {{ saving ? $t('common.saving') : $t('templates.save') }}
        </button>
      </div>
    </form>
  </div>
</template>
