<script setup>
import { nextTick, onBeforeUnmount, ref, watch } from 'vue';
import ConditionGradeBadge from './ConditionGradeBadge.vue';
import { CONDITION_GRADES_BEST_FIRST } from '../conditionGrades.js';

/*
  The Condition grading help, opened from the info button beside the Condition field. It follows the
  About dialog: Bootstrap's modal markup driven by Vue state, Escape and the backdrop close it, the
  focus stays inside while it is open and returns to the opener afterwards.
*/
const open = defineModel('open', { type: Boolean, default: false });

const panel = ref(null);
const closeButton = ref(null);
let opener = null;

const close = () => { open.value = false; };
function onKeydown(event) {
  if (event.key === 'Escape') close();
}
function onFocusIn(event) {
  if (panel.value && !panel.value.contains(event.target)) closeButton.value?.focus();
}
function release() {
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('focusin', onFocusIn);
}

watch(open, async isOpen => {
  if (isOpen) {
    opener = document.activeElement;
    document.body.classList.add('modal-open');
    document.addEventListener('keydown', onKeydown);
    document.addEventListener('focusin', onFocusIn);
    await nextTick();
    closeButton.value?.focus();
    return;
  }
  release();
  if (opener?.isConnected) opener.focus();
  opener = null;
});

onBeforeUnmount(release);
</script>

<template>
  <template v-if="open">
    <div
      ref="panel"
      class="modal modal-blur d-block"
      role="dialog"
      aria-modal="true"
      aria-labelledby="condition-help-title"
      @click.self="close"
    >
      <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
        <div class="modal-content">
          <div class="modal-header">
            <h2
              id="condition-help-title"
              class="modal-title"
            >
              {{ $t('condition.helpTitle') }}
            </h2>
            <button
              ref="closeButton"
              type="button"
              class="btn-close"
              :aria-label="$t('condition.closeHelp')"
              @click="close"
            />
          </div>
          <div class="modal-body">
            <dl class="mb-0">
              <template
                v-for="grade in CONDITION_GRADES_BEST_FIRST"
                :key="grade"
              >
                <dt class="mb-1">
                  <ConditionGradeBadge :grade="grade" />
                </dt>
                <dd class="mb-3">
                  {{ $t(`condition.definitions.${grade}`) }}
                </dd>
              </template>
            </dl>
            <p class="text-secondary mb-0">
              {{ $t('condition.notesHint') }}
            </p>
          </div>
          <div class="modal-footer">
            <button
              type="button"
              class="btn w-100"
              @click="close"
            >
              {{ $t('common.close') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div class="modal-backdrop show" />
  </template>
</template>
