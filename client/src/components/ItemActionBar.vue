<script setup>
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { capabilities } from '../capabilities.js';
import { useDropdownMenu } from '../useDropdownMenu.js';
import {
  IconArchive, IconCopy, IconDots, IconLanguage, IconLink, IconPencil, IconQrcode, IconRefresh, IconRestore,
  IconTemplate, IconTrash, IconUserShare
} from '@tabler/icons-vue';

const props = defineProps({ item: { type: Object, required: true } });
// The page owns every dialog and the delete confirmation; the bar only reports which action was chosen.
const emit = defineEmits(['transfer', 'qr', 'retire', 'restore', 'delete']);
const { t } = useI18n();

/*
  The Item details actions, in one list for both places they appear. `place` is `bar` (always a
  visible button), `menu` (always in More), or `wide` (a visible button from the md breakpoint, in
  More below it, so a phone keeps one row of Edit, QR Code, and More). A change of `group` starts a
  new section of the menu. An action has either a route (`to`) or an event the page handles.
*/
const actions = computed(() => {
  const { item } = props;
  const retired = item.lifecycle_status === 'retired';
  return [
    { key: 'edit', place: 'bar', icon: IconPencil, label: t('common.edit'), to: `/items/${item.id}/edit` },
    // A retired item cannot be lent; a lent one is returned from its Loan card instead.
    !retired && !item.open_transfer && { key: 'transfer', place: 'wide', group: 1, icon: IconUserShare, label: t('transfer.action'), event: 'transfer' },
    { key: 'qr', place: 'bar', icon: IconQrcode, label: t('qr.title'), event: 'qr' },
    // Opens the edit form with the URL import over it; only the values chosen there and then saved change.
    // An item with a saved Source URL offers to read that page again instead; Fill from URL stays in the form.
    capabilities.urlImport && {
      key: 'url', place: 'menu', group: 1, icon: item.source_url ? IconRefresh : IconLink,
      label: t(item.source_url ? 'urlImport.refreshAction' : 'urlImport.fillAction'),
      to: { path: `/items/${item.id}/edit`, query: { import: item.source_url ? 'refresh' : 'url' } }
    },
    // Opens the edit form with Translate Item over it; only translations applied there and then saved change.
    capabilities.ai.enabled && {
      key: 'translate', place: 'menu', group: 1, icon: IconLanguage, label: t('translateItem.action'),
      to: { path: `/items/${item.id}/edit`, query: { translate: 'item' } }
    },
    // Opens the Add Item form prefilled from this item; the copy is created only when saved there.
    { key: 'duplicate', place: 'menu', group: 1, icon: IconCopy, label: t('itemDetails.duplicate'), to: { path: '/items/new', query: { duplicate: item.id } } },
    // Opens the template editor prefilled from this item; nothing is saved until it is confirmed there.
    { key: 'template', place: 'menu', group: 1, icon: IconTemplate, label: t('templates.saveAsTemplate'), to: { path: '/templates/new', query: { fromItem: item.id } } },
    retired
      ? { key: 'restore', place: 'menu', group: 2, icon: IconRestore, label: t('lifecycle.restore.action'), event: 'restore' }
      : { key: 'retire', place: 'menu', group: 2, icon: IconArchive, label: t('lifecycle.retire.action'), event: 'retire' },
    // Last and set apart, so deleting is never a single tap; the page still asks for confirmation.
    { key: 'delete', place: 'menu', group: 3, icon: IconTrash, label: t('itemDetails.delete'), event: 'delete', danger: true }
  ].filter(Boolean);
});
const barActions = computed(() => actions.value.filter(action => action.place !== 'menu'));
const menuActions = computed(() => actions.value
  .filter(action => action.place !== 'bar')
  .map((action, index, list) => ({ ...action, divided: index > 0 && action.group !== list[index - 1].group })));

const { open, root, menu, toggleButton, menuStyle, close } = useDropdownMenu();
// Focus returns to More first, so a dialog opened from the menu gives it back there when it closes.
function choose(action) {
  close();
  emit(action.event);
}
</script>

<template>
  <div class="d-flex flex-nowrap flex-md-wrap gap-2 app-item-actions">
    <template
      v-for="action in barActions"
      :key="action.key"
    >
      <RouterLink
        v-if="action.to"
        :to="action.to"
        class="btn"
        :class="{ 'btn-primary': action.key === 'edit' }"
      >
        <component
          :is="action.icon"
          class="icon"
          aria-hidden="true"
        />
        {{ action.label }}
      </RouterLink>
      <button
        v-else
        type="button"
        class="btn"
        :class="{ 'd-none d-md-inline-flex': action.place === 'wide' }"
        @click="emit(action.event)"
      >
        <component
          :is="action.icon"
          class="icon"
          aria-hidden="true"
        />
        {{ action.label }}
      </button>
    </template>
    <div
      ref="root"
      class="dropdown"
      @keydown.esc="close"
    >
      <button
        ref="toggleButton"
        type="button"
        class="btn dropdown-toggle"
        :aria-expanded="open"
        aria-controls="item-actions-menu"
        :aria-label="$t('itemDetails.moreActions')"
        @click="open = !open"
      >
        <IconDots
          class="icon"
          aria-hidden="true"
        />
        {{ $t('itemDetails.more') }}
      </button>
      <div
        v-if="open"
        id="item-actions-menu"
        ref="menu"
        class="dropdown-menu dropdown-menu-end show app-item-actions-menu"
        :style="menuStyle"
      >
        <template
          v-for="action in menuActions"
          :key="action.key"
        >
          <div
            v-if="action.divided"
            class="dropdown-divider"
            role="separator"
          />
          <RouterLink
            v-if="action.to"
            :to="action.to"
            class="dropdown-item"
          >
            <component
              :is="action.icon"
              class="dropdown-item-icon"
              aria-hidden="true"
            />
            {{ action.label }}
          </RouterLink>
          <button
            v-else
            type="button"
            class="dropdown-item"
            :class="{ 'text-danger': action.danger, 'd-md-none': action.place === 'wide' }"
            @click="choose(action)"
          >
            <component
              :is="action.icon"
              class="dropdown-item-icon"
              aria-hidden="true"
            />
            {{ action.label }}
          </button>
        </template>
      </div>
    </div>
  </div>
</template>
