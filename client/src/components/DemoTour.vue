<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import {
  IconArrowLeft, IconArrowRight, IconBrandGithub, IconCompass, IconDownload, IconPlayerPause, IconPlayerPlay,
  IconPlayerSkipForward, IconPlayerTrackNext, IconRefresh, IconRotate
} from '@tabler/icons-vue';
import { resetDemoData } from '../api.js';
import { appInfo } from '../build-info.js';
import { theme } from '../theme.js';
import { createTourController, tour } from '../demo/tour.js';
import { resolveTarget } from '../demo/tourActions.js';
import { actionLabelKey, copyParams, tourChapters } from '../demo/tourChapters.js';

/*
  The presenter of the public demo's guided tour: a small launcher that never blocks free
  exploration, the chapter card with its controls, and the spotlight around the scene's target. The
  card uses the inverse of the application's color mode, so it stands apart from the page. Its one
  primary button is the shown scene's contextual action while the chapter is unfinished, and Next
  once it is complete; Back, Replay chapter, Skip chapter, Auto Play, and Pause (only with Auto Play)
  are compact icon buttons. On phones the card is a compact strip: one header line with the chapter
  number, title, and scene dots, a thin progress bar, the scene copy (it scrolls inside the card
  when it is long), and one row of controls.

  The spotlight lets clicks through; only the transparent lock covers the page, and only while the
  tour itself changes the page. The card sits above both, so Close and Escape always work.
*/
const { t, locale } = useI18n();
const router = useRouter();
const { start, next, back, replay, advance, toggleAutoplay, pause, resume, close } = createTourController(router);
const total = tourChapters.length;
const chapter = computed(() => tourChapters[tour.chapter]);
const scene = computed(() => chapter.value.scenes.find(entry => entry.id === tour.scenes[tour.scene]));
// The copy names the fixture entities in the tour's language, never as fixed English text.
const params = computed(() => (tour.data.fixture ? copyParams(tour.data) : {}));
const sceneText = computed(() => scene.value && tour.data.fixture
  ? t(`tour.chapters.${chapter.value.id}.scenes.${scene.value.id}`, { ...params.value, ...scene.value.params?.(tour.data, t) })
  : '');
const actionKey = computed(() => (tour.data.fixture ? actionLabelKey(chapter.value, tour.scenes, tour.scene) : null));
const actionLabel = computed(() => (actionKey.value ? t(actionKey.value, params.value) : ''));
const last = computed(() => tour.chapter === total - 1);
const done = computed(() => tour.status === 'done');
const failed = computed(() => tour.status === 'failed');
// The chapter still has scenes to show: its scene action is the primary button.
const running = computed(() => ['opening', 'waiting', 'acting'].includes(tour.status));
const busy = computed(() => ['opening', 'acting'].includes(tour.status));
const presenterTheme = computed(() => (theme.value === 'dark' ? 'light' : 'dark'));
const getUrl = `${appInfo.repositoryUrl}#official-releases`;

const launcher = ref(null);
const heading = ref(null);
const card = ref(null);
// The one primary button that is shown: the scene action, Next, or Explore on your own.
const primary = ref(null);

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

/*
  When the tour has moved on (a scene finished its action, or a chapter opened), the focus goes to
  the new primary button, so Enter or Space continues the tour. The focus is left alone when the
  visitor has put it somewhere on the page themselves.
*/
watch(() => tour.status, async (status, previous) => {
  if (!['waiting', 'done', 'failed'].includes(status) || !['opening', 'acting'].includes(previous)) return;
  await nextTick();
  const focused = document.activeElement;
  const tourOwned = previous === 'acting' || !focused || focused === document.body || card.value?.contains(focused);
  if (tourOwned) primary.value?.focus({ preventScroll: true });
});

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
// While the tour is open, the page keeps room at its end, so no target has to stay under the card.
watch(() => tour.active, active => {
  cancelAnimationFrame(frame);
  document.body.classList.toggle('demo-tour-open', active);
  if (active) track();
  else spot.value = null;
});

/*
  A language change seeds the demo again in the new language (DemoBanner.vue), so the running tour
  and its baseline no longer match the data: the tour closes, and Guided tour starts it afresh.
*/
watch(locale, () => { if (tour.active) finish(); });

// While a scene acts it moves the focus through the page's fields, so Escape stops the tour from anywhere.
const escape = event => { if (event.key === 'Escape' && tour.active && busy.value) finish(); };

// The page keeps room at its end, so the launcher never hides the last controls of a page.
onMounted(() => {
  document.body.classList.add('demo-tour-ready');
  document.addEventListener('keydown', escape);
});
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  close();
  document.body.classList.remove('demo-tour-ready', 'demo-tour-open');
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
    v-if="tour.active && busy && !tour.paused"
    class="demo-tour-lock"
    aria-hidden="true"
  />

  <section
    v-if="tour.active"
    ref="card"
    class="card demo-tour-card"
    :data-bs-theme="presenterTheme"
    role="dialog"
    aria-modal="false"
    aria-labelledby="demo-tour-title"
    @keydown.esc="finish"
  >
    <div class="card-body demo-tour-body">
      <span
        class="avatar avatar-sm bg-primary-lt demo-tour-avatar"
        aria-hidden="true"
      >
        <IconCompass class="icon" />
      </span>
      <div class="demo-tour-identity">
        <div class="subheader">
          {{ $t('tour.label') }}
        </div>
        <div class="small text-secondary">
          {{ $t('tour.progress', { current: tour.chapter + 1, total }) }}
        </div>
      </div>
      <button
        type="button"
        class="btn-close demo-tour-close"
        :aria-label="$t('tour.close')"
        :title="$t('tour.close')"
        @click="finish"
      />
      <div
        class="progress progress-sm demo-tour-progress"
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
        class="h3 mb-0 demo-tour-title"
        tabindex="-1"
      >
        <!-- Phones name the chapter number here, in place of the identity block. -->
        <span
          class="demo-tour-counter"
          aria-hidden="true"
        >{{ $t('tour.progressShort', { current: tour.chapter + 1, total }) }} · </span>
        {{ $t(`tour.chapters.${chapter.id}.title`) }}
      </h2>
      <p
        class="mb-0 demo-tour-text"
        aria-live="polite"
      >
        {{ sceneText }}
      </p>
      <ol
        v-if="tour.scenes.length > 1"
        class="demo-tour-scenes"
        :aria-label="$t('tour.sceneProgress', { current: tour.scene + 1, total: tour.scenes.length })"
      >
        <li
          v-for="(id, index) in tour.scenes"
          :key="id"
          :class="{ 'demo-tour-scene-done': index < tour.scene || done, 'demo-tour-scene-current': index === tour.scene && !done }"
        />
      </ol>
      <span class="small text-secondary demo-tour-status">
        <template v-if="running && tour.paused">{{ $t('tour.paused') }}</template>
        <span
          v-else-if="tour.status === 'acting'"
          class="d-inline-flex align-items-center gap-2"
        >
          <span
            class="spinner-border spinner-border-sm"
            aria-hidden="true"
          />
          {{ $t('tour.playing') }}
        </span>
      </span>
      <div
        v-if="failed"
        class="alert alert-warning mb-0 demo-tour-failure"
        role="alert"
      >
        {{ $t('tour.failed') }}
      </div>
    </div>
    <div class="card-footer demo-tour-controls">
      <button
        type="button"
        class="btn btn-icon"
        :disabled="tour.chapter === 0"
        :aria-label="$t('tour.back')"
        :title="$t('tour.back')"
        @click="back"
      >
        <IconArrowLeft
          class="icon"
          aria-hidden="true"
        />
      </button>
      <!-- Replay is offered at all times; once the chapter is complete or failed it is the highlighted choice. -->
      <button
        type="button"
        class="btn btn-icon"
        :class="{ 'btn-outline-primary': !running }"
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
        v-if="running && !last"
        type="button"
        class="btn btn-icon"
        :aria-label="$t('tour.skip')"
        :title="$t('tour.skip')"
        @click="next"
      >
        <IconPlayerSkipForward
          class="icon"
          aria-hidden="true"
        />
      </button>
      <button
        type="button"
        class="btn btn-icon"
        :class="{ 'btn-outline-primary': tour.autoplay }"
        :aria-pressed="String(tour.autoplay)"
        :aria-label="$t('tour.autoplay')"
        :title="$t('tour.autoplay')"
        @click="toggleAutoplay"
      >
        <IconPlayerTrackNext
          class="icon"
          aria-hidden="true"
        />
      </button>
      <button
        v-if="tour.autoplay && running"
        type="button"
        class="btn btn-icon"
        :aria-label="tour.paused ? $t('tour.resume') : $t('tour.pause')"
        :title="tour.paused ? $t('tour.resume') : $t('tour.pause')"
        @click="tour.paused ? resume() : pause()"
      >
        <component
          :is="tour.paused ? IconPlayerPlay : IconPlayerPause"
          class="icon"
          aria-hidden="true"
        />
      </button>
      <button
        v-if="running && actionLabel"
        ref="primary"
        type="button"
        class="btn btn-primary demo-tour-primary"
        :disabled="tour.status !== 'waiting'"
        :aria-busy="tour.status === 'acting'"
        @click="advance"
      >
        <span
          v-if="tour.status === 'acting'"
          class="spinner-border spinner-border-sm me-2"
          aria-hidden="true"
        />
        {{ actionLabel }}
      </button>
      <button
        v-else-if="!running && !last"
        ref="primary"
        type="button"
        class="btn btn-primary demo-tour-primary"
        @click="next"
      >
        {{ $t('tour.next') }}
        <IconArrowRight
          class="icon ms-1 me-0"
          aria-hidden="true"
        />
      </button>
      <template v-else-if="!running">
        <button
          ref="primary"
          type="button"
          class="btn btn-primary demo-tour-primary"
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
