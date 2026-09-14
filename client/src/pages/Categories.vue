<script setup>
import { onMounted, ref } from 'vue';
import { api, jsonOptions } from '../api.js';

defineOptions({ name: 'CategoryManager' });

const categories = ref([]); const selected = ref(null); const fields = ref([]); const categoryName = ref('');
const newField = ref({ name: '', type: 'text' }); const error = ref('');
async function load() { categories.value = await api('/api/categories'); if (selected.value) selected.value = categories.value.find(c => c.id === selected.value.id) || null; }
async function select(category) { selected.value = category; fields.value = await api(`/api/categories/${category.id}/fields`); }
async function addCategory() { try { await api('/api/categories', jsonOptions('POST', { name: categoryName.value })); categoryName.value = ''; await load(); } catch (e) { error.value = e.message; } }
async function rename(category) { const name = prompt('New category name:', category.name); if (!name || name === category.name) return; try { await api(`/api/categories/${category.id}`, jsonOptions('PUT', { name })); await load(); } catch (e) { error.value = e.message; } }
async function removeCategory(category) { if (!confirm(`Delete category “${category.name}”?`)) return; try { await api(`/api/categories/${category.id}`, { method: 'DELETE' }); if (selected.value?.id === category.id) { selected.value = null; fields.value = []; } await load(); } catch (e) { error.value = e.message; } }
async function addField() { try { await api(`/api/categories/${selected.value.id}/fields`, jsonOptions('POST', newField.value)); newField.value = { name: '', type: 'text' }; await select(selected.value); await load(); } catch (e) { error.value = e.message; } }
async function removeField(field) { if (!confirm(`Delete field “${field.name}”? Saved values may also be deleted.`)) return; try { await api(`/api/fields/${field.id}?confirm=true`, { method: 'DELETE' }); await select(selected.value); await load(); } catch (e) { error.value = e.message; } }
onMounted(() => load().catch(e => error.value = e.message));
</script>
<template>
  <h1 class="h3 mb-3">
    Categories &amp; Fields
  </h1><div
    v-if="error"
    class="alert alert-danger alert-dismissible"
  >
    {{ error }}<button
      class="btn-close"
      @click="error = ''"
    />
  </div>
  <div class="row g-4">
    <div class="col-lg-6">
      <div class="card">
        <div class="card-header fw-semibold">
          Categories
        </div><div class="card-body border-bottom">
          <form
            class="input-group"
            @submit.prevent="addCategory"
          >
            <input
              v-model="categoryName"
              class="form-control"
              placeholder="New category name"
              required
            ><button class="btn btn-primary">
              Add
            </button>
          </form>
        </div>
        <div class="list-group list-group-flush">
          <div
            v-for="c in categories"
            :key="c.id"
            role="button"
            tabindex="0"
            class="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
            :class="{ active: selected?.id === c.id }"
            @click="select(c)"
            @keydown.enter="select(c)"
          >
            <span><strong>{{ c.name }}</strong><small
              class="d-block"
              :class="selected?.id === c.id ? 'text-white-50' : 'text-secondary'"
            >{{ c.item_count }} items · {{ c.field_count }} fields</small></span><span class="d-flex gap-1"><button
              type="button"
              class="btn btn-sm"
              :class="selected?.id === c.id ? 'btn-outline-light' : 'btn-outline-secondary'"
              @click.stop="rename(c)"
            >Rename</button><button
              type="button"
              class="btn btn-sm"
              :class="selected?.id === c.id ? 'btn-outline-light' : 'btn-outline-danger'"
              @click.stop="removeCategory(c)"
            >Delete</button></span>
          </div><div
            v-if="!categories.length"
            class="p-3 text-secondary"
          >
            No categories yet.
          </div>
        </div>
      </div>
    </div>
    <div class="col-lg-6">
      <div class="card">
        <div class="card-header fw-semibold">
          Fields <span v-if="selected">for {{ selected.name }}</span>
        </div><div
          v-if="!selected"
          class="card-body text-secondary"
        >
          Select a category.
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
                  placeholder="Field name"
                  required
                >
              </div><div class="col-4">
                <select
                  v-model="newField.type"
                  class="form-select"
                  aria-label="Field type"
                >
                  <option value="text">
                    Text
                  </option><option value="number">
                    Number
                  </option><option value="date">
                    Date
                  </option><option value="boolean">
                    Boolean
                  </option>
                </select>
              </div><div class="col-2">
                <button class="btn btn-primary w-100">
                  Add
                </button>
              </div>
            </form>
          </div>
          <ul class="list-group list-group-flush">
            <li
              v-for="field in fields"
              :key="field.id"
              class="list-group-item d-flex justify-content-between align-items-center"
            >
              <span>{{ field.name }} <span class="badge text-bg-secondary">{{ field.type }}</span></span><button
                class="btn btn-outline-danger btn-sm"
                @click="removeField(field)"
              >
                Delete
              </button>
            </li><li
              v-if="!fields.length"
              class="list-group-item text-secondary"
            >
              No custom fields.
            </li>
          </ul>
        </template>
      </div>
    </div>
  </div>
</template>
