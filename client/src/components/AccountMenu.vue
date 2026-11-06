<script setup>
import { computed } from 'vue';
import { IconDevices, IconLogout, IconUserCircle } from '@tabler/icons-vue';
import { auth, signOut } from '../auth.js';
import { useDropdownMenu } from '../useDropdownMenu.js';

defineProps({ menuId: { type: String, default: 'account-menu' } });
// The role name is interface text; the account name is user data and shown exactly as stored.
const roleLabel = computed(() => (auth.user?.role === 'admin' ? 'auth.roles.admin' : 'auth.roles.viewer'));
const { open, root, menu, toggleButton, menuStyle, close } = useDropdownMenu();
</script>

<template>
  <div
    ref="root"
    class="dropdown app-account-menu"
    @keydown.esc="close"
  >
    <button
      ref="toggleButton"
      type="button"
      class="btn btn-ghost-secondary btn-sm dropdown-toggle"
      :aria-expanded="open"
      :aria-controls="menuId"
      :aria-label="$t('auth.account.menu', { name: auth.user?.username })"
      @click="open = !open"
    >
      <IconUserCircle
        class="icon"
        aria-hidden="true"
      />
      <span class="app-account-name">{{ auth.user?.username }}</span>
    </button>
    <div
      v-if="open"
      :id="menuId"
      ref="menu"
      class="dropdown-menu dropdown-menu-end show"
      :style="menuStyle"
    >
      <div class="dropdown-header">
        <div class="text-body fw-medium text-truncate">
          {{ auth.user?.username }}
        </div>
        <div>{{ $t(roleLabel) }}</div>
      </div>
      <RouterLink
        to="/settings/sessions"
        class="dropdown-item"
        @click="open = false"
      >
        <IconDevices
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        {{ $t('auth.account.sessions') }}
      </RouterLink>
      <button
        type="button"
        class="dropdown-item"
        @click="signOut()"
      >
        <IconLogout
          class="dropdown-item-icon"
          aria-hidden="true"
        />
        {{ $t('auth.signOut') }}
      </button>
    </div>
  </div>
</template>
