import { reactive, ref, watch } from 'vue';
import { api } from './api.js';

/*
  Item drafts are the single way the item form and the template editor are prefilled. A draft has the
  shape the AI analysis and the template API return — { categoryId, baseFields, dynamicFields } — so a
  blank form, an AI suggestion, a template, and an existing item all initialize the same fields.
*/
const BASE_FIELDS = ['description', 'condition', 'location', 'purchase_date', 'purchase_price', 'serial_number', 'transferred_to'];
const baseFields = (source, name) => ({ name, ...Object.fromEntries(BASE_FIELDS.map(key => [key, source[key]])) });

export const draftFromItem = item => ({
  categoryId: item.category_id,
  baseFields: baseFields(item, item.name),
  dynamicFields: Object.fromEntries(item.fields.filter(field => field.value !== null).map(field => [field.id, field.value]))
});

export const draftFromTemplate = template => ({
  categoryId: template.category_id,
  baseFields: baseFields(template, template.item_name),
  dynamicFields: template.field_values
});

/*
  The shared form state: the base fields, the categories, and the custom fields of the chosen
  category. `emptyBoolean` is what a yes/no field starts with: "No" for an item, unset for a template.
  Values of fields outside the current category stay in the form but are never sent.
*/
export function useItemDraftForm({ emptyBoolean = '0' } = {}) {
  const form = reactive({
    name: '', category_id: '', description: '', condition: '', location: '', purchase_date: '',
    purchase_price: { amount: '', currency: 'UAH' }, serial_number: '', transferred_to: '', field_values: {}
  });
  const categories = ref([]);
  const fields = ref([]);
  let ready = false;

  async function loadFields(categoryId) {
    fields.value = categoryId ? await api(`/api/categories/${categoryId}/fields`) : [];
    for (const field of fields.value) {
      if (!(field.id in form.field_values)) form.field_values[field.id] = field.type === 'boolean' ? emptyBoolean : '';
    }
  }
  watch(() => form.category_id, async id => { if (ready) await loadFields(id); });

  // Loads the categories, applies the draft when there is one, and only then follows category changes.
  async function start(draft = null) {
    categories.value = await api('/api/categories');
    if (draft) {
      const base = draft.baseFields || {};
      Object.assign(form, {
        name: base.name || '',
        // A category that no longer exists is never kept: the user has to choose one.
        category_id: categories.value.some(category => category.id === draft.categoryId) ? draft.categoryId : '',
        description: base.description || '',
        condition: base.condition || '',
        location: base.location || '',
        purchase_date: base.purchase_date || '',
        purchase_price: base.purchase_price ? { ...base.purchase_price } : { amount: '', currency: 'UAH' },
        serial_number: base.serial_number || '',
        transferred_to: base.transferred_to || ''
      });
      for (const [id, value] of Object.entries(draft.dynamicFields || {})) form.field_values[id] = value ?? '';
    }
    await loadFields(form.category_id);
    ready = true;
  }

  const fieldValues = () => Object.fromEntries(fields.value.map(field => [field.id, form.field_values[field.id]]));

  return { form, categories, fields, start, fieldValues };
}
