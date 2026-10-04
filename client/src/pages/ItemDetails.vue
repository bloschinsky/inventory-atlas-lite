<script setup>
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { formatDate, formatDateTime, formatMoney } from '../i18n/index.js';
import AuditContentsDialog from '../components/AuditContentsDialog.vue';
import ChecklistRunHistory from '../components/ChecklistRunHistory.vue';
import ItemPhotoViewer from '../components/ItemPhotoViewer.vue';
import ItemNewStatusBadge from '../components/ItemNewStatusBadge.vue';
import ItemQrDialog from '../components/ItemQrDialog.vue';
import ConditionGradeBadge from '../components/ConditionGradeBadge.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';

const route = useRoute(); const router = useRouter(); const { t } = useI18n();
const item = ref(null); const error = ref(''); const qrOpen = ref(false); const auditOpen = ref(false);
// The container's audits, newest first; the page keeps only the most recent ones compact.
const audits = ref([]);
const RECENT_AUDITS = 5;
// Custom field values are user data: only the yes/no of a boolean belongs to the interface.
const displayValue = field => field.type === 'boolean' ? t(field.value === '1' ? 'common.yes' : 'common.no') : (field.value || '—');
// An item with neither a container nor contents would only produce an empty storage card.
const hasStorage = computed(() => Boolean(item.value?.parent || item.value?.children.length));

async function load() {
  try {
    [item.value, audits.value] = await Promise.all([api(`/api/items/${route.params.id}`), api(`/api/items/${route.params.id}/audits`)]);
  } catch (e) { error.value = e.message; }
}
async function remove() {
  if (!confirm(t('itemDetails.confirmDelete', { name: item.value.name }))) return;
  try { await api(`/api/items/${item.value.id}`, { method: 'DELETE' }); router.push('/items'); } catch (e) { error.value = e.message; }
}
async function removePhoto(id) {
  if (!confirm(t('photos.confirmDelete'))) return;
  try { await api(`/api/photos/${id}`, { method: 'DELETE' }); await load(); } catch (e) { error.value = e.message; }
}
// The same component serves every /items/:id, so parent and contents links must reload it.
watch(() => route.params.id, () => { qrOpen.value = false; auditOpen.value = false; load(); });
onMounted(load);
</script>

<template>
  <div
    v-if="error"
    class="alert alert-danger"
    role="alert"
  >
    {{ error }}
  </div>
  <div
    v-else-if="!item"
    class="card"
  >
    <div class="card-body d-flex align-items-center gap-2 text-secondary">
      <span
        class="spinner-border spinner-border-sm"
        aria-hidden="true"
      />
      {{ $t('itemDetails.loading') }}
    </div>
  </div>
  <template v-else>
    <!-- The heading block stays first in the DOM so the name precedes the photo on phones. -->
    <div class="page-header mb-3">
      <div class="row g-2 align-items-center">
        <div class="col min-w-0">
          <ol class="breadcrumb page-pretitle mb-1">
            <li class="breadcrumb-item">
              <RouterLink to="/items">
                {{ $t('itemDetails.allItems') }}
              </RouterLink>
            </li>
            <li
              class="breadcrumb-item active"
              aria-current="page"
            >
              {{ item.category_name }}
            </li>
          </ol>
          <h1 class="page-title text-break">
            {{ item.name }}
          </h1>
          <span
            v-if="item.transferred_to"
            class="badge bg-azure-lt text-wrap text-break text-start mt-2"
          >
            {{ $t('items.transferredTo', { name: item.transferred_to }) }}
          </span>
        </div>
        <div class="col-auto ms-auto d-flex flex-wrap gap-2">
          <RouterLink
            :to="`/items/${item.id}/edit`"
            class="btn btn-primary"
          >
            {{ $t('common.edit') }}
          </RouterLink>
          <!-- Opens the Add Item form prefilled from this item; the copy is created only when saved there. -->
          <RouterLink
            :to="{ path: '/items/new', query: { duplicate: item.id } }"
            class="btn"
          >
            {{ $t('itemDetails.duplicate') }}
          </RouterLink>
          <button
            type="button"
            class="btn"
            @click="qrOpen = true"
          >
            {{ $t('qr.title') }}
          </button>
          <!-- Opens the template editor prefilled from this item; nothing is saved until it is confirmed there. -->
          <RouterLink
            :to="{ path: '/templates/new', query: { fromItem: item.id } }"
            class="btn"
          >
            {{ $t('templates.saveAsTemplate') }}
          </RouterLink>
          <button
            type="button"
            class="btn btn-outline-danger"
            @click="remove"
          >
            {{ $t('common.delete') }}
          </button>
        </div>
      </div>
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-5">
        <ItemPhotoViewer
          :photos="item.photos"
          @delete="removePhoto"
        />
      </div>
      <div class="col-12 col-lg-7 d-grid gap-4">
        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              {{ $t('itemDetails.details') }}
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-4">
                {{ $t('items.fields.isNew') }}
              </dt>
              <dd class="col-sm-8">
                <ItemNewStatusBadge :is-new="item.is_new" />
              </dd>
              <dt class="col-sm-4">
                {{ $t('items.fields.condition') }}
              </dt>
              <dd class="col-sm-8">
                <ConditionGradeBadge :grade="item.condition_grade" />
              </dd>
              <template v-if="item.condition_notes">
                <dt class="col-sm-4">
                  {{ $t('items.fields.conditionNotes') }}
                </dt>
                <dd class="col-sm-8 text-break condition-notes">
                  {{ item.condition_notes }}
                </dd>
              </template>
              <dt class="col-sm-4">
                {{ $t('items.fields.location') }}
              </dt>
              <dd class="col-sm-8 text-break">
                {{ item.effective_location || '—' }}
                <span
                  v-if="item.effective_location_source"
                  class="d-block meta-text"
                >
                  {{ $t('items.inheritedLocation') }}
                </span>
              </dd>
              <!-- Written only by a completed verification run, never edited in the item form. -->
              <dt class="col-sm-4">
                {{ $t('itemDetails.lastVerified') }}
              </dt>
              <dd class="col-sm-8">
                {{ formatDateTime(item.last_verified_at) || $t('itemDetails.neverVerified') }}
              </dd>
              <template v-if="item.purchase_date">
                <dt class="col-sm-4">
                  {{ $t('items.fields.purchaseDate') }}
                </dt>
                <dd class="col-sm-8 text-break">
                  {{ formatDate(item.purchase_date) }}
                </dd>
              </template>
              <template v-if="item.purchase_price">
                <dt class="col-sm-4">
                  {{ $t('items.fields.purchasePrice') }}
                </dt>
                <dd class="col-sm-8 text-break">
                  {{ formatMoney(item.purchase_price.amount, item.purchase_price.currency) }}
                </dd>
              </template>
              <template v-if="item.serial_number">
                <dt class="col-sm-4">
                  {{ $t('items.fields.serialNumber') }}
                </dt>
                <dd class="col-sm-8 text-break">
                  {{ item.serial_number }}
                </dd>
              </template>
              <dt class="col-sm-4">
                {{ $t('items.fields.description') }}
              </dt>
              <dd class="col-sm-8 text-break mb-0">
                {{ item.description || '—' }}
              </dd>
            </dl>
          </div>
        </section>

        <section
          v-if="item.fields.length"
          class="card"
        >
          <div class="card-header">
            <h2 class="card-title">
              {{ $t('itemDetails.categoryFields', { category: item.category_name }) }}
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <template
                v-for="(field, index) in item.fields"
                :key="field.id"
              >
                <dt class="col-sm-4">
                  {{ field.name }}
                </dt>
                <dd
                  class="col-sm-8 text-break"
                  :class="{ 'mb-0': index === item.fields.length - 1 }"
                >
                  {{ displayValue(field) }}
                </dd>
              </template>
            </dl>
          </div>
        </section>

        <section
          v-if="hasStorage"
          class="card"
        >
          <div class="card-header">
            <h2 class="card-title">
              {{ $t('itemDetails.storage') }}
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-4">
                {{ $t('items.fields.storedInside') }}
              </dt>
              <dd class="col-sm-8 text-break mb-0">
                <RouterLink
                  v-if="item.parent"
                  :to="`/items/${item.parent.id}`"
                >
                  {{ item.parent.name }}
                </RouterLink>
                <template v-else>
                  —
                </template>
              </dd>
            </dl>
          </div>
          <template v-if="item.children.length">
            <div class="card-header border-top">
              <h3 class="card-title">
                {{ $t('itemDetails.contents') }}
              </h3>
              <div class="card-actions">
                <button
                  type="button"
                  class="btn btn-sm"
                  @click="auditOpen = true"
                >
                  {{ $t('checklists.audit.action') }}
                </button>
              </div>
            </div>
            <ul class="list-group list-group-flush">
              <li
                v-for="child in item.children"
                :key="child.id"
                class="list-group-item d-flex align-items-center gap-3"
              >
                <ItemThumbnail
                  :photo-id="child.thumbnail_id"
                  :name="child.name"
                />
                <div class="min-w-0">
                  <RouterLink
                    :to="`/items/${child.id}`"
                    class="item-card-link"
                  >
                    {{ child.name }}
                  </RouterLink>
                  <p class="meta-text mb-0">
                    {{ child.category_name }}<template v-if="child.condition_grade">
                      · <ConditionGradeBadge :grade="child.condition_grade" />
                    </template>
                  </p>
                </div>
              </li>
            </ul>
          </template>
        </section>

        <!-- Shown whenever audits exist, even after the container was emptied, so their history stays reachable. -->
        <section
          v-if="audits.length"
          class="card"
          aria-labelledby="recent-audits"
        >
          <div class="card-header">
            <h2
              id="recent-audits"
              class="card-title"
            >
              {{ $t('checklists.audit.recent') }}
            </h2>
            <div
              v-if="audits.length > RECENT_AUDITS"
              class="card-actions"
            >
              <RouterLink to="/checklists">
                {{ $t('checklists.audit.allHistory') }}
              </RouterLink>
            </div>
          </div>
          <ChecklistRunHistory :runs="audits.slice(0, RECENT_AUDITS)" />
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              {{ $t('itemDetails.record') }}
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0 meta-text">
              <dt class="col-sm-4">
                UUID
              </dt>
              <dd class="col-sm-8 text-break">
                {{ item.uuid }}
              </dd>
              <dt class="col-sm-4">
                {{ $t('items.fields.created') }}
              </dt>
              <dd class="col-sm-8">
                {{ formatDateTime(item.created_at) || '—' }}
              </dd>
              <dt class="col-sm-4">
                {{ $t('items.fields.updated') }}
              </dt>
              <dd class="col-sm-8 mb-0">
                {{ formatDateTime(item.updated_at) || '—' }}
              </dd>
            </dl>
          </div>
        </section>
      </div>
    </div>

    <ItemQrDialog
      v-if="qrOpen"
      :item="item"
      @close="qrOpen = false"
    />
    <AuditContentsDialog
      v-if="auditOpen"
      :item="item"
      @close="auditOpen = false"
    />
  </template>
</template>
