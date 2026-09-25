<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { api, jsonOptions } from '../api.js';
import { capabilities } from '../capabilities.js';
import PageHeader from '../components/PageHeader.vue';
import BatchAddFieldsDialog from '../components/BatchAddFieldsDialog.vue';
import { FIELD_TYPES } from '../../../shared/fieldDefinitions.js';

defineOptions({ name: 'CategoryManager' });
const { t } = useI18n();

const categories = ref([]); const selected = ref(null); const fields = ref([]); const categoryName = ref('');
const newField = ref({ name: '', type: 'text' }); const error = ref(''); const dialogMode = ref('');
async function load() { categories.value = await api('/api/categories'); if (selected.value) selected.value = categories.value.find(c => c.id === selected.value.id) || null; }
async function select(category) { selected.value = category; fields.value = await api(`/api/categories/${category.id}/fields`); }
async function addCategory() { try { await api('/api/categories', jsonOptions('POST', { name: categoryName.value })); categoryName.value = ''; await load(); } catch (e) { error.value = e.message; } }
async function rename(category) { const name = prompt(t('categories.renamePrompt'), category.name); if (!name || name === category.name) return; try { await api(`/api/categories/${category.id}`, jsonOptions('PUT', { name })); await load(); } catch (e) { error.value = e.message; } }
async function removeCategory(category) { if (!confirm(t('categories.confirmDelete', { name: category.name }))) return; try { await api(`/api/categories/${category.id}`, { method: 'DELETE' }); if (selected.value?.id === category.id) { selected.value = null; fields.value = []; } await load(); } catch (e) { error.value = e.message; } }
async function addField() { try { await api(`/api/categories/${selected.value.id}/fields`, jsonOptions('POST', newField.value)); newField.value = { name: '', type: 'text' }; await select(selected.value); await load(); } catch (e) { error.value = e.message; } }
async function batchCreated() { dialogMode.value = ''; await select(selected.value); await load(); }
async function removeField(field) { if (!confirm(t('categories.confirmDeleteField', { name: field.name }))) return; try { await api(`/api/fields/${field.id}?confirm=true`, { method: 'DELETE' }); await select(selected.value); await load(); } catch (e) { error.value = e.message; } }
onMounted(() => load().catch(e => error.value = e.message));
</script>
<template>
  <PageHeader
    :title="$t('categories.title')"
    :subtitle="$t('categories.subtitle')"
  />
  <div
    v-if="error"
    class="alert alert-danger alert-dismissible"
    role="alert"
  >
    {{ error }}<button
      class="btn-close"
      :aria-label="$t('common.dismissError')"
      @click="error = ''"
    />
  </div>
  <div class="row g-4">
    <div class="col-12 col-lg-6">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            {{ $t('categories.categories') }}
          </h2>
        </div><div class="card-body border-bottom">
          <form
            class="input-group"
            @submit.prevent="addCategory"
          >
            <input
              v-model="categoryName"
              class="form-control"
              :placeholder="$t('categories.newCategory')"
              required
            ><button class="btn btn-primary">
              {{ $t('common.add') }}
            </button>
          </form>
        </div>
        <div class="list-group list-group-flush">
          <div
            v-for="c in categories"
            :key="c.id"
            role="button"
            tabindex="0"
            class="list-group-item list-group-item-action d-flex flex-wrap justify-content-between align-items-center gap-2"
            :class="{ active: selected?.id === c.id }"
            @click="select(c)"
            @keydown.enter="select(c)"
          >
            <span><strong>{{ c.name }}</strong><small
              class="d-block"
              :class="selected?.id === c.id ? 'text-white-50' : 'text-secondary'"
            >{{ $t('categories.itemCount', c.item_count) }} · {{ $t('categories.fieldCount', c.field_count) }}</small></span><span class="d-flex gap-1"><button
              type="button"
              class="btn btn-sm"
              :class="selected?.id === c.id ? 'btn-outline-light' : 'btn-outline-secondary'"
              @click.stop="rename(c)"
            >{{ $t('common.rename') }}</button><button
              type="button"
              class="btn btn-sm"
              :class="selected?.id === c.id ? 'btn-outline-light' : 'btn-outline-danger'"
              @click.stop="removeCategory(c)"
            >{{ $t('common.delete') }}</button></span>
          </div><div
            v-if="!categories.length"
            class="p-3 text-secondary"
          >
            {{ $t('categories.empty') }}
          </div>
        </div>
      </div>
    </div>
    <div class="col-12 col-lg-6">
      <div class="card">
        <div class="card-header">
          <h2 class="card-title">
            {{ selected ? $t('categories.fieldsFor', { name: selected.name }) : $t('categories.fields') }}
          </h2>
        </div><div
          v-if="!selected"
          class="card-body text-secondary"
        >
          {{ $t('categories.selectCategory') }}
        </div><template v-else>
          <div class="card-body border-bottom">
            <form
              class="row g-2"
              @submit.prevent="addField"
            >
              <div class="col-6">
                <input
                  v-model="newField.name"
                  class="form-control"
                  :placeholder="$t('categories.fieldName')"
                  required
                >
              </div><div class="col-4">
                <select
                  v-model="newField.type"
                  class="form-select"
                  :aria-label="$t('categories.fieldType')"
                >
                  <option
                    v-for="type in FIELD_TYPES"
                    :key="type.value"
                    :value="type.value"
                  >
                    {{ $t(`fieldTypes.${type.value}`) }}
                  </option>
                </select>
              </div><div class="col-2">
                <button class="btn btn-primary w-100">
                  {{ $t('common.add') }}
                </button>
              </div>
            </form>
            <div class="mt-2 d-flex flex-wrap gap-2">
              <button
                type="button"
                class="btn btn-outline-primary btn-sm"
                @click="dialogMode = 'json'"
              >
                {{ $t('batchFields.title') }}
              </button>
              <button
                v-if="capabilities.ai.enabled"
                type="button"
                class="btn btn-outline-primary btn-sm"
                @click="dialogMode = 'ai'"
              >
                {{ $t('batchFields.aiTitle') }}
              </button>
            </div>
          </div>
          <ul class="list-group list-group-flush">
            <li
              v-for="field in fields"
              :key="field.id"
              class="list-group-item d-flex justify-content-between align-items-center"
            >
              <span>{{ field.name }} <span class="badge bg-blue-lt">{{ $t(`fieldTypes.${field.type}`) }}</span></span><button
                class="btn btn-outline-danger btn-sm"
                @click="removeField(field)"
              >
                {{ $t('common.delete') }}
              </button>
            </li><li
              v-if="!fields.length"
              class="list-group-item text-secondary"
            >
              {{ $t('categories.noFields') }}
            </li>
          </ul>
        </template>
      </div>
    </div>
  </div>
  <BatchAddFieldsDialog
    v-if="dialogMode && selected"
    :key="dialogMode"
    :category="selected"
    :existing-fields="fields"
    :mode="dialogMode"
    @close="dialogMode = ''"
    @created="batchCreated"
  />
</template>
