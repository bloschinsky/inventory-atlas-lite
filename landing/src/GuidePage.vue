<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconBook, IconBrandGithub, IconChevronDown, IconExternalLink, IconLink, IconListDetails, IconPlayerPlay } from '@tabler/icons-vue';
import { guideLoaders } from 'virtual:guide';
import GuideDiagram from './GuideDiagram.vue';
import GuideExtras from './GuideExtras.vue';
import GuideToc from './GuideToc.vue';
import ScreenshotLightbox from './ScreenshotLightbox.vue';
import SiteFooter from './SiteFooter.vue';
import SiteNav from './SiteNav.vue';
import { guidePresentation } from '../guidePresentation.js';
import { guideSourceUrl } from '../site.js';
import { demoLink, homeUrl, info } from './content.js';
import { provideScreenshotViewer } from './screenshotViewer.js';

/*
  The public user guide: docs/HOW-TO.md, or its translation in the page language, rendered at build
  time (landing/guideSource.js) and loaded per language from virtual:guide. The page lays it out with
  the landing's look: a dark title band, a sticky table of contents on wide screens and an On this
  page panel on phones, numbered sections, and the presentation layer of landing/guidePresentation.js.
  Section ids are the same in every language, so an anchor survives a reload and a language change.
*/
const { locale, t } = useI18n();
const { viewer } = provideScreenshotViewer();
const guide = shallowRef(null);
const active = ref(null);

const pad = number => String(number).padStart(2, '0');
const diagramsOf = id => guidePresentation[id]?.diagrams ?? [];
const demoUrl = computed(() => (info.demoUrl ? demoLink(locale.value) : null));

// Every heading id with the numbered section it belongs to, and its title.
const headings = computed(() => new Map((guide.value?.sections ?? []).flatMap(section => [
  [section.id, { section: section.id, title: section.title }],
  ...section.subsections.map(sub => [sub.id, { section: section.id, title: sub.title }])
])));
const activeSection = computed(() => headings.value.get(active.value)?.section ?? null);
const activeTitle = computed(() => headings.value.get(active.value)?.title ?? null);

/*
  The heading being read: the last one whose top has passed under the sticky bars (with room for the
  number a section heading keeps above it). Above the first section nothing is current.
*/
let frame = 0;
function track() {
  frame = 0;
  const headingElements = document.querySelectorAll('[data-guide-heading]');
  const line = headingElements.length ? parseFloat(getComputedStyle(headingElements[0]).scrollMarginTop) + 24 : 0;
  let current = null;
  for (const heading of headingElements) {
    if (heading.getBoundingClientRect().top > line) break;
    current = heading.id;
  }
  active.value = current;
}
const onScroll = () => { frame ||= requestAnimationFrame(track); };
onMounted(() => window.addEventListener('scroll', onScroll, { passive: true }));
onBeforeUnmount(() => {
  window.removeEventListener('scroll', onScroll);
  cancelAnimationFrame(frame);
});

/*
  Loads the guide of a language. The first load opens the section of the address's anchor, which
  the browser could not find before the guide existed; a language change keeps the section being read.
*/
let request = 0;
async function load(code) {
  const current = ++request;
  const keep = guide.value ? active.value : decodeURIComponent(window.location.hash.slice(1));
  const { default: data } = await guideLoaders[code]();
  if (current !== request) return;
  guide.value = data;
  await nextTick();
  if (keep && headings.value.has(keep)) {
    // The typeface changes the line breaks, so the section is found once it has loaded.
    await document.fonts.ready;
    if (current === request) document.getElementById(keep).scrollIntoView({ behavior: 'instant' });
  }
  track();
}
watch(locale, load, { immediate: true });

// The phone's On this page panel: a disclosure under the navigation that closes on a choice or Escape.
const tocOpen = ref(false);
const tocButton = ref(null);
function closeToc(returnFocus = false) {
  tocOpen.value = false;
  // The bar is sticky and always in view, so focus never scrolls the page (see LanguageMenu.vue).
  if (returnFocus) tocButton.value.focus({ preventScroll: true });
}
</script>

<template>
  <!--
    eslint-disable vue/no-v-html -- the guide's HTML is rendered at build time from the repository's
    own Markdown by markdown-it with raw HTML disabled, so it carries no markup the Markdown did not.
  -->
  <a
    class="visually-hidden-focusable landing-skip"
    href="#guide-content"
  >{{ t('nav.skip') }}</a>

  <SiteNav :home="homeUrl">
    <a
      class="landing-nav-link d-none d-md-inline"
      :href="`${homeUrl}#hierarchy`"
    >{{ t('nav.features') }}</a>
    <a
      class="landing-nav-link landing-nav-current d-none d-md-inline"
      href="#top"
      aria-current="page"
    >{{ t('nav.guide') }}</a>
    <a
      class="landing-nav-link d-none d-md-inline"
      :href="`${homeUrl}#install`"
    >{{ t('nav.install') }}</a>
  </SiteNav>

  <main
    id="main"
    :aria-busy="String(!guide)"
  >
    <header
      id="top"
      class="guide-hero landing-dark"
      data-bs-theme="dark"
    >
      <div class="container-xl">
        <p class="landing-eyebrow">
          <span class="landing-eyebrow-icon">
            <IconBook
              class="icon"
              aria-hidden="true"
            />
          </span>
          {{ t('guide.eyebrow') }}
        </p>
        <template v-if="guide">
          <h1 class="guide-title">
            {{ guide.title }}
          </h1>
          <div
            class="guide-lead"
            v-html="guide.intro"
          />
        </template>
        <div class="landing-actions">
          <a
            v-if="demoUrl"
            class="btn btn-primary"
            :href="demoUrl"
            target="_blank"
            rel="noopener noreferrer"
          >
            <IconPlayerPlay
              class="icon"
              aria-hidden="true"
            />
            {{ t('hero.demo') }}
            <span class="visually-hidden">{{ t('hero.newTab') }}</span>
            <IconExternalLink
              class="icon icon-end landing-external"
              aria-hidden="true"
            />
          </a>
          <a
            class="btn btn-outline-secondary"
            :href="guideSourceUrl(locale)"
          >
            <IconBrandGithub
              class="icon"
              aria-hidden="true"
            />
            {{ t('guide.source') }}
          </a>
        </div>
      </div>
    </header>

    <div
      v-if="guide"
      class="guide-mobile-toc d-lg-none"
      @keydown.esc="closeToc(true)"
    >
      <div class="container-xl">
        <button
          ref="tocButton"
          type="button"
          class="guide-toc-toggle"
          :aria-expanded="String(tocOpen)"
          aria-controls="guide-mobile-toc-panel"
          @click="tocOpen = !tocOpen"
        >
          <IconListDetails
            class="icon"
            aria-hidden="true"
          />
          <span class="guide-toc-toggle-label">{{ t('guide.toc.title') }}</span>
          <span
            v-if="activeTitle"
            class="guide-toc-toggle-current"
          >{{ activeTitle }}</span>
          <IconChevronDown
            class="icon guide-toc-chevron"
            aria-hidden="true"
          />
        </button>
        <nav
          v-show="tocOpen"
          id="guide-mobile-toc-panel"
          class="guide-toc-panel"
          :aria-label="t('guide.toc.label')"
        >
          <GuideToc
            :sections="guide.sections"
            :active="active"
            :active-section="activeSection"
            @navigate="closeToc()"
          />
        </nav>
      </div>
    </div>

    <div
      v-if="guide"
      class="container-xl guide-layout"
    >
      <aside class="guide-aside d-none d-lg-block">
        <nav
          class="guide-aside-nav"
          :aria-label="t('guide.toc.label')"
        >
          <p
            class="guide-aside-title"
            aria-hidden="true"
          >
            {{ t('guide.toc.title') }}
          </p>
          <GuideToc
            :sections="guide.sections"
            :active="active"
            :active-section="activeSection"
          />
        </nav>
      </aside>

      <article
        id="guide-content"
        class="guide-article"
        tabindex="-1"
        :lang="guide.locale"
      >
        <section
          v-for="section in guide.sections"
          :key="section.id"
          class="guide-section"
          :aria-labelledby="section.id"
        >
          <p
            class="guide-number"
            aria-hidden="true"
          >
            {{ pad(section.number) }}
          </p>
          <div class="guide-heading">
            <h2
              :id="section.id"
              class="guide-h2"
              data-guide-heading
            >
              {{ section.title }}
            </h2>
            <a
              class="guide-anchor"
              :href="`#${section.id}`"
              :aria-label="t('guide.anchor', { title: section.title })"
            ><IconLink
              class="icon"
              aria-hidden="true"
            /></a>
          </div>
          <GuideExtras :id="section.id" />
          <div
            class="guide-prose"
            v-html="section.html"
          />
          <GuideDiagram
            v-for="name in diagramsOf(section.id)"
            :key="name"
            :name="name"
          />

          <section
            v-for="sub in section.subsections"
            :key="sub.id"
            class="guide-subsection"
            :aria-labelledby="sub.id"
          >
            <div class="guide-heading">
              <h3
                :id="sub.id"
                class="guide-h3"
                data-guide-heading
              >
                {{ sub.title }}
              </h3>
              <a
                class="guide-anchor"
                :href="`#${sub.id}`"
                :aria-label="t('guide.anchor', { title: sub.title })"
              ><IconLink
                class="icon"
                aria-hidden="true"
              /></a>
            </div>
            <GuideExtras :id="sub.id" />
            <div
              class="guide-prose"
              v-html="sub.html"
            />
            <GuideDiagram
              v-for="name in diagramsOf(sub.id)"
              :key="name"
              :name="name"
            />
          </section>
        </section>
      </article>
    </div>
  </main>

  <SiteFooter />
  <ScreenshotLightbox ref="viewer" />
</template>
