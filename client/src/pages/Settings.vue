<script setup>
import { computed } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import PageHeader from '../components/PageHeader.vue';
import { settingsGroups, settingsPath } from '../settingsSections.js';

defineOptions({ name: 'SettingsPage' });
const route = useRoute();
const router = useRouter();

// The matched route record ignores a trailing slash or a query, such as the cloud OAuth return.
const currentPath = computed(() => route.matched.at(-1)?.path);
const isCurrent = section => currentPath.value === settingsPath(section);
</script>

<template>
  <div>
    <PageHeader
      :title="$t('settings.title')"
      :subtitle="$t('settings.subtitle')"
    />
    <div class="row g-4">
      <div class="col-lg-auto d-none d-lg-block">
        <nav
          class="settings-nav"
          :aria-label="$t('settings.sections')"
        >
          <div
            v-for="group in settingsGroups"
            :key="group.id"
            class="mb-4"
            role="group"
            :aria-labelledby="`settings-group-${group.id}`"
          >
            <div
              :id="`settings-group-${group.id}`"
              class="subheader mb-2"
            >
              {{ $t(group.label) }}
            </div>
            <div class="list-group list-group-transparent">
              <RouterLink
                v-for="section in group.sections"
                :key="section.path"
                :to="settingsPath(section)"
                class="list-group-item list-group-item-action d-flex align-items-center gap-2 py-2"
                :class="{ active: isCurrent(section) }"
                :aria-current="isCurrent(section) ? 'page' : undefined"
              >
                <component
                  :is="section.icon"
                  class="icon"
                  aria-hidden="true"
                />
                {{ $t(section.label) }}
              </RouterLink>
            </div>
          </div>
        </nav>
      </div>
      <div class="col-lg min-w-0">
        <!-- Phones get one native selector instead of the side list: compact, keyboard-ready, and it grows with the sections. -->
        <div class="d-lg-none mb-3">
          <label
            class="form-label"
            for="settings-section"
          >{{ $t('settings.section') }}</label>
          <select
            id="settings-section"
            class="form-select"
            :value="currentPath"
            @change="router.push($event.target.value)"
          >
            <optgroup
              v-for="group in settingsGroups"
              :key="group.id"
              :label="$t(group.label)"
            >
              <option
                v-for="section in group.sections"
                :key="section.path"
                :value="settingsPath(section)"
              >
                {{ $t(section.label) }}
              </option>
            </optgroup>
          </select>
        </div>
        <div class="form-card">
          <RouterView />
        </div>
      </div>
    </div>
  </div>
</template>
