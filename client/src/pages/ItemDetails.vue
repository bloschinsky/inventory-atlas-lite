<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import { api } from '../api.js';
import { formatDate, formatDateTime, formatMoney } from '../i18n/index.js';
import AuditContentsDialog from '../components/AuditContentsDialog.vue';
import ChecklistRunHistory from '../components/ChecklistRunHistory.vue';
import ColorValue from '../components/ColorValue.vue';
import ItemPhotoViewer from '../components/ItemPhotoViewer.vue';
import ItemLifecycleBadge from '../components/ItemLifecycleBadge.vue';
import ItemNewStatusBadge from '../components/ItemNewStatusBadge.vue';
import ItemQrDialog from '../components/ItemQrDialog.vue';
import ConditionGradeBadge from '../components/ConditionGradeBadge.vue';
import ItemThumbnail from '../components/ItemThumbnail.vue';
import ItemHistoryTimeline from '../components/ItemHistoryTimeline.vue';
import ItemLoanDialog from '../components/ItemLoanDialog.vue';
import RestoreItemDialog from '../components/RestoreItemDialog.vue';
import RetireItemDialog from '../components/RetireItemDialog.vue';

const route = useRoute(); const router = useRouter(); const { t } = useI18n();
const item = ref(null); const error = ref(''); const qrOpen = ref(false); const auditOpen = ref(false); const loanOpen = ref(false);
const history = ref(null);
// The due date is a calendar day; the loan is overdue from the day after it, in the browser's time zone.
const today = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const overdue = computed(() => Boolean(item.value?.open_transfer?.expected_return_on && item.value.open_transfer.expected_return_on < today()));
// Retire and Restore each have their own dialog; `notice` reports the finished transition or the next step.
const retireOpen = ref(false); const restoreOpen = ref(false); const notice = ref(''); const noticeBox = ref(null);
const retired = computed(() => item.value?.lifecycle_status === 'retired');
// The container's audits, newest first; the page keeps only the most recent ones compact.
const audits = ref([]);
const RECENT_AUDITS = 5;
// Custom field values are user data: only the yes/no of a boolean belongs to the interface; a color has its own face.
const displayValue = field => field.type === 'boolean' ? t(field.value === '1' ? 'common.yes' : 'common.no') : (field.value || '—');
// An item with neither a container nor contents would only produce an empty storage card.
const hasStorage = computed(() => Boolean(item.value?.parent || item.value?.children.length));

async function load() {
  try {
    [item.value, audits.value] = await Promise.all([api(`/api/items/${route.params.id}`), api(`/api/items/${route.params.id}/audits`)]);
  } catch (e) { error.value = e.message; }
}
// A loan or return changes the item (its recipient) and adds to its history.
async function loanSaved() {
  loanOpen.value = false;
  await load();
  history.value?.reload();
}
async function remove() {
  if (!confirm(t('itemDetails.confirmDelete', { name: item.value.name }))) return;
  try { await api(`/api/items/${item.value.id}`, { method: 'DELETE' }); router.push('/items'); } catch (e) { error.value = e.message; }
}
async function showNotice(message) {
  notice.value = message;
  await nextTick();
  noticeBox.value?.focus();
}
async function retiredDone({ item: updated, affected_count: count }) {
  retireOpen.value = false;
  item.value = updated;
  history.value?.reload();
  await showNotice(t('lifecycle.retire.done', { name: updated.name, n: count }, count));
}
async function restoredDone({ item: updated, affected_count: count }) {
  restoreOpen.value = false;
  item.value = updated;
  history.value?.reload();
  await showNotice(t('lifecycle.restore.done', { name: updated.name, n: count }, count));
}
// Move contents first: nothing is retired; the contents list is where each item can be opened and moved.
async function moveContentsFirst() {
  retireOpen.value = false;
  await showNotice(t('lifecycle.retire.moveFirstNotice'));
}
async function removePhoto(id) {
  if (!confirm(t('photos.confirmDelete'))) return;
  try { await api(`/api/photos/${id}`, { method: 'DELETE' }); await load(); } catch (e) { error.value = e.message; }
}
// The same component serves every /items/:id, so parent and contents links must reload it.
watch(() => route.params.id, () => {
  qrOpen.value = false; auditOpen.value = false; loanOpen.value = false; retireOpen.value = false; restoreOpen.value = false;
  notice.value = '';
  load();
});
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
          <div
            v-if="retired || item.transferred_to"
            class="d-flex flex-wrap gap-2 mt-2"
          >
            <ItemLifecycleBadge :status="item.lifecycle_status" />
            <span
              v-if="item.transferred_to"
              class="badge bg-azure-lt text-wrap text-break text-start"
            >
              {{ $t('items.transferredTo', { name: item.transferred_to }) }}
            </span>
          </div>
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
          <!-- A retired item has left the inventory, so it cannot be lent. -->
          <button
            v-if="!item.open_transfer && !retired"
            type="button"
            class="btn"
            @click="loanOpen = true"
          >
            {{ $t('transfer.action') }}
          </button>
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
            v-if="retired"
            type="button"
            class="btn"
            @click="notice = ''; restoreOpen = true"
          >
            {{ $t('lifecycle.restore.action') }}
          </button>
          <button
            v-else
            type="button"
            class="btn"
            @click="notice = ''; retireOpen = true"
          >
            {{ $t('lifecycle.retire.action') }}
          </button>
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

    <div
      v-if="notice"
      ref="noticeBox"
      class="alert alert-success alert-dismissible"
      role="status"
      tabindex="-1"
    >
      {{ notice }}<button
        type="button"
        class="btn-close"
        :aria-label="$t('common.dismissMessage')"
        @click="notice = ''"
      />
    </div>

    <div class="row g-4">
      <div class="col-12 col-lg-5">
        <ItemPhotoViewer
          :photos="item.photos"
          @delete="removePhoto"
        />
      </div>
      <div class="col-12 col-lg-7 d-grid gap-4">
        <!-- An open temporary loan; its recipient is also the item's current Transferred To. -->
        <section
          v-if="item.open_transfer"
          class="card"
          aria-labelledby="item-loan"
        >
          <div class="card-header">
            <h2
              id="item-loan"
              class="card-title"
            >
              {{ $t('transfer.loan') }}
            </h2>
            <div class="card-actions">
              <button
                type="button"
                class="btn btn-sm btn-primary"
                @click="loanOpen = true"
              >
                {{ $t('transfer.markReturned') }}
              </button>
            </div>
          </div>
          <div class="card-body">
            <p class="fw-semibold mb-1 text-break">
              {{ $t('transfer.onLoanTo', { name: item.open_transfer.recipient }) }}
              <span
                v-if="overdue"
                class="badge bg-red-lt ms-1"
              >{{ $t('transfer.overdue') }}</span>
            </p>
            <p class="meta-text mb-0">
              {{ $t('transfer.since', { date: formatDateTime(item.open_transfer.transferred_at) }) }}<template v-if="item.open_transfer.expected_return_on">
                · {{ $t('history.expectedReturn', { date: formatDate(item.open_transfer.expected_return_on) }) }}
              </template>
            </p>
            <p
              v-if="item.open_transfer.note"
              class="text-secondary text-break mt-2 mb-0 app-history-note"
            >
              {{ item.open_transfer.note }}
            </p>
          </div>
        </section>

        <!-- What is known about the departure; the location and container are snapshots from that moment. -->
        <section
          v-if="item.retirement"
          class="card"
          aria-labelledby="retirement-title"
        >
          <div class="card-header">
            <h2
              id="retirement-title"
              class="card-title"
            >
              {{ $t('lifecycle.details.title') }}
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-4">
                {{ $t('lifecycle.fields.reason') }}
              </dt>
              <dd class="col-sm-8">
                {{ $t(`lifecycle.reasons.${item.retirement.reason}`) }}
              </dd>
              <dt class="col-sm-4">
                {{ $t('lifecycle.fields.retiredAt') }}
              </dt>
              <dd class="col-sm-8">
                {{ formatDateTime(item.retirement.retired_at) }}
              </dd>
              <template v-if="item.retirement.recipient">
                <dt class="col-sm-4">
                  {{ $t('lifecycle.fields.recipient') }}
                </dt>
                <dd class="col-sm-8 text-break">
                  {{ item.retirement.recipient }}
                </dd>
              </template>
              <template v-if="item.retirement.note">
                <dt class="col-sm-4">
                  {{ $t('lifecycle.fields.note') }}
                </dt>
                <dd class="col-sm-8 text-break condition-notes">
                  {{ item.retirement.note }}
                </dd>
              </template>
              <dt class="col-sm-4">
                {{ $t('lifecycle.fields.lastLocation') }}
              </dt>
              <dd
                class="col-sm-8 text-break"
                :class="{ 'mb-0': !item.retirement.former_parent || item.parent }"
              >
                {{ item.retirement.last_location || '—' }}
              </dd>
              <template v-if="item.retirement.former_parent && !item.parent">
                <dt class="col-sm-4">
                  {{ $t('lifecycle.fields.formerContainer') }}
                </dt>
                <dd class="col-sm-8 text-break mb-0">
                  <RouterLink :to="`/items/${item.retirement.former_parent.uuid}`">
                    {{ item.retirement.former_parent.name }}
                  </RouterLink>
                </dd>
              </template>
            </dl>
          </div>
        </section>

        <section class="card">
          <div class="card-header">
            <h2 class="card-title">
              {{ $t('itemDetails.details') }}
            </h2>
          </div>
          <div class="card-body">
            <dl class="row mb-0">
              <dt class="col-sm-4">
                {{ $t('lifecycle.fields.status') }}
              </dt>
              <dd class="col-sm-8">
                <ItemLifecycleBadge
                  :status="item.lifecycle_status"
                  show-active
                />
              </dd>
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
                  <ColorValue
                    v-if="field.type === 'color'"
                    :value="field.value"
                    show-hex
                  />
                  <template v-else>
                    {{ displayValue(field) }}
                  </template>
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
              <div
                v-if="!retired"
                class="card-actions"
              >
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
                  <ItemLifecycleBadge
                    class="ms-2"
                    :status="child.lifecycle_status"
                  />
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

        <section
          class="card"
          aria-labelledby="item-history"
        >
          <div class="card-header">
            <h2
              id="item-history"
              class="card-title"
            >
              {{ $t('history.title') }}
            </h2>
            <div class="card-actions">
              <RouterLink :to="`/items/${item.id}/history`">
                {{ $t('history.viewAll') }}
              </RouterLink>
            </div>
          </div>
          <div class="card-body">
            <ItemHistoryTimeline
              ref="history"
              :item-id="item.id"
              preview
            />
          </div>
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
    <ItemLoanDialog
      v-if="loanOpen"
      :item="item"
      :transfer="item.open_transfer"
      @close="loanOpen = false"
      @saved="loanSaved"
    />
    <RetireItemDialog
      v-if="retireOpen"
      :item="item"
      @close="retireOpen = false"
      @retired="retiredDone"
      @move-contents="moveContentsFirst"
    />
    <RestoreItemDialog
      v-if="restoreOpen"
      :item="item"
      @close="restoreOpen = false"
      @restored="restoredDone"
    />
  </template>
</template>
