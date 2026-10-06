<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  IconArrowLeft, IconArrowRight, IconBrandGithub, IconCompass, IconDownload, IconPlayerPause, IconPlayerPlay, IconRefresh, IconRotate
} from '@tabler/icons-vue';
import { resetDemoData } from '../api.js';
import { appInfo } from '../build-info.js';
import { theme } from '../theme.js';
import { createTourController, tour } from '../demo/tour.js';
import { resolveTarget } from '../demo/tourActions.js';
import { copyParams, tourChapters } from '../demo/tourChapters.js';

/*
  The presenter of the public demo's guided tour: a small launcher that never blocks free
  exploration, the chapter card with its controls, and the spotlight around the scene's target. The
  card uses the inverse of the application's color mode, so it stands apart from the page. The
  spotlight lets clicks through; only the transparent lock covers the page, and only while a chapter
  plays and is not paused. The card sits above both, so Pause, Close, and Escape always work.
*/
const { t, locale } = useI18n();
const router = useRouter();
const { start, next, back, replay, pause, resume, close } = createTourController(router);
const total = tourChapters.length;
const chapter = computed(() => tourChapters[tour.chapter]);
const scene = computed(() => chapter.value.scenes.find(entry => entry.id === tour.scenes[tour.scene]));
// The copy names the fixture entities in the tour's language, never as fixed English text.
const sceneText = computed(() => scene.value && tour.data.fixture
  ? t(`tour.chapters.${chapter.value.id}.scenes.${scene.value.id}`, { ...copyParams(tour.data), ...scene.value.params?.(tour.data, t) })
  : '');
const last = computed(() => tour.chapter === total - 1);
const playing = computed(() => tour.status === 'playing');
const failed = computed(() => tour.status === 'failed');
const presenterTheme = computed(() => (theme.value === 'dark' ? 'light' : 'dark'));
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
  const elements = resolveTarget(tour.target);
  let box = null;
  if (elements.length) {
    const rects = elements.map(element => element.getBoundingClientRect());
    const top = Math.min(...rects.map(rect => rect.top));
    const left = Math.min(...rects.map(rect => rect.left));
    const width = Math.max(...rects.map(rect => rect.right)) - left;
    const height = Math.max(...rects.map(rect => rect.bottom)) - top;
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

/*
  A language change seeds the demo again in the new language (DemoBanner.vue), so the running tour
  and its baseline no longer match the data: the tour closes, and Guided tour starts it afresh.
*/
watch(locale, () => { if (tour.active) finish(); });

// While a chapter plays it moves the focus through the page's fields, so Escape stops the tour from anywhere.
const escape = event => { if (event.key === 'Escape' && tour.active && playing.value) finish(); };

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
    v-if="tour.active && playing && !tour.paused"
    class="demo-tour-lock"
    aria-hidden="true"
  />

  <section
    v-if="tour.active"
    class="card demo-tour-card"
    :data-bs-theme="presenterTheme"
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
            {{ $t('tour.progress', { current: tour.chapter + 1, total }) }}
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
        :aria-valuenow="tour.chapter + 1"
        aria-valuemin="1"
        :aria-valuemax="total"
        :aria-valuetext="$t('tour.progress', { current: tour.chapter + 1, total })"
      >
        <div
          class="progress-bar"
          :style="{ width: `${(tour.chapter + 1) / total * 100}%` }"
        />
      </div>
      <h2
        id="demo-tour-title"
        ref="heading"
        class="h3 mb-1"
        tabindex="-1"
      >
        {{ $t(`tour.chapters.${chapter.id}.title`) }}
      </h2>
      <p
        class="mb-2 demo-tour-text"
        aria-live="polite"
      >
        {{ sceneText }}
      </p>
      <div class="d-flex flex-wrap align-items-center gap-2">
        <ol
          v-if="tour.scenes.length > 1"
          class="demo-tour-scenes"
          :aria-label="$t('tour.sceneProgress', { current: tour.scene + 1, total: tour.scenes.length })"
        >
          <li
            v-for="(id, index) in tour.scenes"
            :key="id"
            :class="{ 'demo-tour-scene-done': index < tour.scene || tour.status === 'done', 'demo-tour-scene-current': index === tour.scene }"
          />
        </ol>
        <span class="small text-secondary me-auto">
          <template v-if="playing && tour.paused">{{ $t('tour.paused') }}</template>
          <span
            v-else-if="playing"
            class="d-inline-flex align-items-center gap-2"
          >
            <span
              class="spinner-border spinner-border-sm"
              aria-hidden="true"
            />
            {{ $t('tour.playing') }}
          </span>
        </span>
      </div>
      <div
        v-if="failed"
        class="alert alert-warning mt-2 mb-0"
        role="alert"
      >
        {{ $t('tour.failed') }}
      </div>
    </div>
    <div
      class="card-footer d-flex flex-wrap gap-2"
    >
      <button
        type="button"
        class="btn"
        :disabled="tour.chapter === 0"
        @click="back"
      >
        <IconArrowLeft
          class="icon"
          aria-hidden="true"
        />
        {{ $t('tour.back') }}
      </button>
      <button
        v-if="playing"
        type="button"
        class="btn"
        @click="tour.paused ? resume() : pause()"
      >
        <component
          :is="tour.paused ? IconPlayerPlay : IconPlayerPause"
          class="icon"
          aria-hidden="true"
        />
        {{ tour.paused ? $t('tour.resume') : $t('tour.pause') }}
      </button>
      <!-- Replay is offered at all times; once the chapter has played it is the highlighted choice. -->
      <button
        type="button"
        class="btn btn-icon"
        :class="{ 'btn-outline-primary': !playing }"
        :aria-label="$t('tour.replay')"
        :title="$t('tour.replay')"
        @click="replay"
      >
        <IconRotate
          class="icon"
          aria-hidden="true"
        />
      </button>
      <button
        v-if="!last"
        type="button"
        class="btn btn-primary ms-auto"
        @click="next"
      >
        {{ $t('tour.next') }}
        <IconArrowRight
          class="icon ms-1 me-0"
          aria-hidden="true"
        />
      </button>
      <template v-else>
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
      </template>
    </div>
  </section>
</template>
