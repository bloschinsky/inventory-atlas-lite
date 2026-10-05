<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { IconArrowLeft, IconArrowRight, IconBrandGithub, IconCompass, IconDownload, IconRefresh } from '@tabler/icons-vue';
import { resetDemoData } from '../api.js';
import { appInfo } from '../build-info.js';
import { createTourController, tour } from '../demo/tour.js';
import { findHook, isShown } from '../demo/tourActions.js';
import { tourSteps } from '../demo/tourSteps.js';

/*
  The presenter of the public demo's guided tour: a small launcher that never blocks free
  exploration, the step card with its controls, and the spotlight around the step's target. The
  spotlight lets clicks through; only the transparent lock covers the page, and only while a step
  is performing its actions. The card sits above both, so Close (or Escape) always works.
*/
const router = useRouter();
const { start, next, back, retry, skipStep, close } = createTourController(router);
const total = tourSteps.length;
const step = computed(() => tourSteps[tour.index]);
const last = computed(() => tour.index === total - 1);
const working = computed(() => tour.status === 'working');
const failed = computed(() => tour.status === 'failed');
const getUrl = `${appInfo.repositoryUrl}#official-releases`;

const launcher = ref(null);
const heading = ref(null);

async function open() {
  const starting = start();
  await nextTick();
  heading.value?.focus();
  await starting;
}
async function finish() {
  close();
  await nextTick();
  launcher.value?.focus();
}
async function resetAndFinish() {
  await finish();
  await resetDemoData();
  await router.push('/dashboard');
}

// The spotlight follows its target through scrolling, layout changes, and form filling.
const spot = ref(null);
let frame = 0;
function track() {
  const target = tour.target && findHook(tour.target);
  let box = null;
  if (target && isShown(target)) {
    const { top, left, width, height } = target.getBoundingClientRect();
    box = { top: `${top - 6}px`, left: `${left - 6}px`, width: `${width + 12}px`, height: `${height + 12}px` };
  }
  if (JSON.stringify(box) !== JSON.stringify(spot.value)) spot.value = box;
  frame = requestAnimationFrame(track);
}
watch(() => tour.active, active => {
  cancelAnimationFrame(frame);
  if (active) track();
  else spot.value = null;
});

// While a step acts it moves the focus through the page's fields, so Escape stops the tour from anywhere.
const escape = event => { if (event.key === 'Escape' && tour.active && working.value) finish(); };

// The page keeps room at its end, so the launcher never hides the last controls of a page.
onMounted(() => {
  document.body.classList.add('demo-tour-ready');
  document.addEventListener('keydown', escape);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  close();
  document.body.classList.remove('demo-tour-ready');
  document.removeEventListener('keydown', escape);
});
</script>

<template>
  <button
    v-if="!tour.active"
    ref="launcher"
    type="button"
    class="btn btn-primary demo-tour-launcher"
    @click="open"
  >
    <IconCompass
      class="icon"
      aria-hidden="true"
    />
    {{ $t('tour.launch') }}
  </button>

  <div
    v-if="spot"
    class="demo-tour-spotlight"
    :style="spot"
    aria-hidden="true"
  />
  <div
    v-if="tour.active && working"
    class="demo-tour-lock"
    aria-hidden="true"
  />

  <section
    v-if="tour.active"
    class="card demo-tour-card"
    role="dialog"
    aria-modal="false"
    aria-labelledby="demo-tour-title"
    @keydown.esc="finish"
  >
    <div class="card-body">
      <div class="d-flex align-items-center gap-2 mb-2">
        <span
          class="avatar avatar-sm bg-primary-lt"
          aria-hidden="true"
        >
          <IconCompass class="icon" />
        </span>
        <div class="me-auto">
          <div class="subheader">
            {{ $t('tour.label') }}
          </div>
          <div class="small text-secondary">
            {{ $t('tour.progress', { current: tour.index + 1, total }) }}
          </div>
        </div>
        <button
          type="button"
          class="btn-close"
          :aria-label="$t('tour.close')"
          :title="$t('tour.close')"
          @click="finish"
        />
      </div>
      <div
        class="progress progress-sm mb-3"
        role="progressbar"
        :aria-label="$t('tour.progressLabel')"
        :aria-valuenow="tour.index + 1"
        aria-valuemin="1"
        :aria-valuemax="total"
      >
        <div
          class="progress-bar"
          :style="{ width: `${(tour.index + 1) / total * 100}%` }"
        />
      </div>
      <div aria-live="polite">
        <h2
          id="demo-tour-title"
          ref="heading"
          class="h3 mb-1"
          tabindex="-1"
        >
          {{ $t(`tour.steps.${step.id}.title`) }}
        </h2>
        <p class="mb-0">
          {{ $t(`tour.steps.${step.id}.text`) }}
        </p>
        <p
          v-if="working"
          class="small text-secondary d-flex align-items-center gap-2 mt-2 mb-0"
        >
          <span
            class="spinner-border spinner-border-sm"
            aria-hidden="true"
          />
          {{ $t('tour.working') }}
        </p>
        <div
          v-if="failed"
          class="alert alert-warning mt-2 mb-0"
          role="alert"
        >
          <p class="mb-2">
            {{ $t('tour.failed') }}
          </p>
          <div class="d-flex flex-wrap gap-2">
            <button
              type="button"
              class="btn btn-sm"
              @click="retry"
            >
              <IconRefresh
                class="icon"
                aria-hidden="true"
              />
              {{ $t('common.retry') }}
            </button>
            <button
              type="button"
              class="btn btn-sm"
              @click="skipStep"
            >
              {{ $t('tour.skipStep') }}
            </button>
          </div>
        </div>
      </div>
    </div>
    <div
      v-if="!last"
      class="card-footer d-flex gap-2"
    >
      <button
        type="button"
        class="btn"
        :disabled="tour.index === 0"
        @click="back"
      >
        <IconArrowLeft
          class="icon"
          aria-hidden="true"
        />
        {{ $t('tour.back') }}
      </button>
      <button
        type="button"
        class="btn btn-primary ms-auto"
        :disabled="working || failed"
        @click="next"
      >
        {{ $t('tour.next') }}
        <IconArrowRight
          class="icon ms-1 me-0"
          aria-hidden="true"
        />
      </button>
    </div>
    <div
      v-else
      class="card-footer d-flex flex-wrap gap-2"
    >
      <button
        type="button"
        class="btn"
        @click="back"
      >
        <IconArrowLeft
          class="icon"
          aria-hidden="true"
        />
        {{ $t('tour.back') }}
      </button>
      <button
        type="button"
        class="btn btn-primary ms-auto"
        @click="finish"
      >
        {{ $t('tour.explore') }}
      </button>
      <div class="d-flex flex-wrap gap-2 w-100">
        <button
          type="button"
          class="btn btn-sm"
          @click="resetAndFinish"
        >
          <IconRefresh
            class="icon"
            aria-hidden="true"
          />
          {{ $t('demo.reset') }}
        </button>
        <a
          class="btn btn-sm"
          :href="getUrl"
        >
          <IconDownload
            class="icon"
            aria-hidden="true"
          />
          {{ $t('demo.get') }}
        </a>
        <a
          class="btn btn-sm"
          :href="appInfo.repositoryUrl"
        >
          <IconBrandGithub
            class="icon"
            aria-hidden="true"
          />
          {{ $t('tour.github') }}
        </a>
      </div>
    </div>
  </section>
</template>
