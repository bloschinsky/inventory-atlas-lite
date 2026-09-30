<script setup>
import { useI18n } from 'vue-i18n';
import { formatDateTime } from '../i18n/index.js';
import { runTitle, stateBadge, stateKey } from '../checklists.js';

const { t } = useI18n();

// Run summaries, newest first. Each row opens the run with its captured snapshot and result.
defineProps({
  runs: { type: Array, required: true },
  // The runs of deleted checklists and container audits are told apart by the name of their snapshot.
  showName: { type: Boolean, default: false }
});
</script>

<template>
  <div class="table-responsive">
    <table class="table table-vcenter card-table">
      <thead>
        <tr>
          <th>{{ $t('checklists.started') }}</th>
          <th>{{ $t('checklists.status') }}</th>
          <th>{{ $t('checklists.result') }}</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="run in runs"
          :key="run.id"
        >
          <td>
            <RouterLink :to="`/checklists/runs/${run.id}`">
              {{ formatDateTime(run.started_at) }}
            </RouterLink>
            <div
              v-if="showName"
              class="meta-text text-break"
            >
              {{ runTitle(t, run) }}<template v-if="run.audit_scope">
                · {{ $t(`checklists.audit.scopes.${run.audit_scope}`) }}
              </template>
            </div>
          </td>
          <td>
            <span
              class="badge"
              :class="run.status === 'completed' ? 'bg-blue-lt' : 'bg-yellow-lt'"
            >{{ $t(`checklists.runStatus.${run.status}`) }}</span>
          </td>
          <td>
            <div class="d-flex flex-wrap gap-1">
              <span
                v-for="status in ['confirmed', 'missing', 'pending']"
                :key="status"
                class="badge"
                :class="stateBadge[status]"
              >{{ $t('checklists.countLabel', { label: $t(stateKey(run.mode, status)), count: run.counts[status] }) }}</span>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
