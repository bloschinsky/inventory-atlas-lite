<script setup>
import { computed, onBeforeUnmount, onMounted, provide, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { IconBook, IconBrandGithub, IconExternalLink, IconPlayerPlay, IconRocket } from '@tabler/icons-vue';
import FeatureSection from './FeatureSection.vue';
import LanguageMenu from './LanguageMenu.vue';
import ScreenshotLightbox from './ScreenshotLightbox.vue';
import { links } from '../site.js';
import { demoLink, facts, hero, info, installOptions, screenshotUrl, sections } from './content.js';

const { locale, t } = useI18n();

// The history stores calendar dates; UTC keeps the day from shifting in the visitor's time zone.
const releaseDate = computed(() => (info.release.date
  ? new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${info.release.date}T00:00:00Z`))
  : null));
const demoUrl = computed(() => (info.demoUrl ? demoLink(locale.value) : null));

/*
  Screenshot links open the viewer with the screenshots of their section. A modified click (new tab,
  new window, download) keeps the plain link to the full-size file, as without the page script.
*/
const viewer = ref(null);
function openScreenshot(gallery, index, event) {
  if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  viewer.value.open(gallery, index, event.currentTarget);
}
provide('openScreenshot', openScreenshot);

/*
  Reveal on scroll: each .landing-reveal element fades in once it enters the viewport. The hidden
  state is enabled only here (see landing.css), so without the observer everything stays visible.
*/
let observer = null;
onMounted(() => {
  if (!('IntersectionObserver' in window)) return;
  observer = new IntersectionObserver(entries => {
    for (const entry of entries.filter(entry => entry.isIntersecting)) {
      entry.target.classList.add('is-visible');
      observer.unobserve(entry.target);
    }
  }, { rootMargin: '0px 0px -8% 0px' });
  document.querySelectorAll('.landing-reveal').forEach(element => observer.observe(element));
  document.documentElement.classList.add('landing-reveal-ready');
});
onBeforeUnmount(() => observer?.disconnect());
</script>

<template>
  <a
    class="visually-hidden-focusable landing-skip"
    href="#main"
  >{{ t('nav.skip') }}</a>

  <nav
    class="landing-nav landing-dark navbar"
    data-bs-theme="dark"
    :aria-label="t('nav.label')"
  >
    <div class="container-xl">
      <a
        class="landing-brand"
        href="#top"
      >
        <svg
          class="landing-brand-mark"
          viewBox="0 0 24 24"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z M3 7l9 4.5L21 7M12 11.5V21"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linejoin="round"
          />
        </svg>
        Inventory Atlas Lite
      </a>
      <div class="d-flex align-items-center gap-2 gap-md-3">
        <a
          class="landing-nav-link d-none d-md-inline"
          href="#hierarchy"
        >{{ t('nav.features') }}</a>
        <a
          class="landing-nav-link d-none d-md-inline"
          href="#install"
        >{{ t('nav.install') }}</a>
        <LanguageMenu />
        <a
          class="btn btn-outline-secondary"
          :href="links.github"
        >
          <IconBrandGithub
            class="icon"
            aria-hidden="true"
          />
          <span class="landing-nav-label">GitHub</span>
        </a>
      </div>
    </div>
  </nav>

  <main id="main">
    <header
      id="top"
      class="landing-hero landing-dark"
      data-bs-theme="dark"
    >
      <div class="container-xl">
        <div class="row align-items-center g-5">
          <div class="col-lg-5">
            <p class="landing-eyebrow">
              {{ t('hero.eyebrow') }}
            </p>
            <h1 class="landing-title">
              Inventory Atlas Lite
            </h1>
            <p class="landing-lead">
              {{ t('hero.lead') }}
            </p>
            <div class="landing-actions">
              <a
                class="btn btn-primary btn-lg"
                :href="links.get"
              >{{ t('hero.get') }}</a>
              <a
                class="btn btn-outline-secondary btn-lg"
                :href="links.github"
              >
                <IconBrandGithub
                  class="icon"
                  aria-hidden="true"
                />
                {{ t('hero.github') }}
              </a>
              <a
                v-if="demoUrl"
                class="btn btn-outline-primary btn-lg"
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
            </div>
            <p
              class="landing-release"
              data-testid="release"
            >
              {{ t('hero.release') }}
              <a :href="info.release.url">v{{ info.release.version }}</a>
              <template v-if="releaseDate">
                · {{ releaseDate }}
              </template>
            </p>
          </div>
          <div class="col-lg-7">
            <div class="landing-hero-media">
              <a
                v-for="(image, index) in hero"
                :key="image.name"
                class="landing-shot-link"
                :class="{ 'landing-hero-phone': image.phone }"
                :href="screenshotUrl(locale, image.name)"
                aria-haspopup="dialog"
                aria-describedby="landing-viewer-hint"
                @click="openScreenshot(hero, index, $event)"
              >
                <img
                  class="landing-shot"
                  :class="{ 'landing-shot-phone': image.phone }"
                  :src="screenshotUrl(locale, image.name)"
                  :alt="t(`screenshots.${image.name}.alt`)"
                  :fetchpriority="image.phone ? null : 'high'"
                >
              </a>
            </div>
          </div>
        </div>
      </div>
    </header>

    <section
      class="landing-facts-band landing-dark"
      data-bs-theme="dark"
      aria-labelledby="facts-title"
    >
      <div class="container-xl">
        <h2
          id="facts-title"
          class="visually-hidden"
        >
          {{ t('facts.title') }}
        </h2>
        <dl class="landing-facts landing-reveal">
          <div
            v-for="fact in facts"
            :key="fact"
            class="landing-fact"
          >
            <dt>{{ t(`facts.items.${fact}.term`) }}</dt>
            <dd>{{ t(`facts.items.${fact}.text`) }}</dd>
          </div>
        </dl>
      </div>
    </section>

    <FeatureSection
      v-for="(section, index) in sections"
      :key="section.id"
      :section="section"
      :number="index + 1"
      :reverse="index % 2 === 1"
    />

    <section
      id="install"
      class="landing-section landing-install"
      aria-labelledby="install-title"
    >
      <div class="container-xl">
        <div class="landing-section-heading landing-reveal">
          <p class="landing-eyebrow">
            <span class="landing-eyebrow-icon">
              <IconRocket
                class="icon"
                aria-hidden="true"
              />
            </span>
            {{ t('install.eyebrow') }}
          </p>
          <h2
            id="install-title"
            class="landing-section-title"
          >
            {{ t('install.title') }}
          </h2>
          <p class="landing-text">
            {{ t('install.text') }}
          </p>
        </div>
        <div class="row g-4">
          <div
            v-for="(option, index) in installOptions"
            :key="option.id"
            class="col-sm-6 col-lg-3 landing-reveal"
            :style="{ '--landing-reveal-delay': `${index * 0.08}s` }"
          >
            <div class="card h-100">
              <div class="card-body d-flex flex-column">
                <component
                  :is="option.icon"
                  class="landing-card-icon"
                  aria-hidden="true"
                />
                <h3 class="card-title mb-2">
                  {{ t(`install.options.${option.id}.title`) }}
                </h3>
                <p class="text-secondary">
                  {{ t(`install.options.${option.id}.text`) }}
                </p>
                <a
                  class="mt-auto"
                  :href="option.link"
                >{{ t(`install.options.${option.id}.label`) }}</a>
              </div>
            </div>
          </div>
        </div>
        <p class="landing-note">
          {{ t('install.note') }}
        </p>
      </div>
    </section>

    <section
      class="landing-section landing-final landing-dark"
      data-bs-theme="dark"
      aria-labelledby="final-title"
    >
      <div class="container-xl text-center landing-reveal">
        <h2
          id="final-title"
          class="landing-section-title"
        >
          {{ t('final.title') }}
        </h2>
        <p class="landing-text mx-auto">
          {{ t('final.text') }}
        </p>
        <div class="landing-actions justify-content-center">
          <a
            class="btn btn-primary btn-lg"
            :href="links.get"
          >{{ t('hero.get') }}</a>
          <a
            class="btn btn-outline-secondary btn-lg"
            :href="links.github"
          >
            <IconBrandGithub
              class="icon"
              aria-hidden="true"
            />
            {{ t('hero.github') }}
          </a>
          <a
            class="btn btn-ghost-secondary btn-lg"
            :href="links.guide"
          >
            <IconBook
              class="icon"
              aria-hidden="true"
            />
            {{ t('final.guide') }}
          </a>
        </div>
      </div>
    </section>
  </main>

  <footer
    class="landing-footer landing-dark"
    data-bs-theme="dark"
  >
    <div class="container-xl d-flex flex-wrap justify-content-between gap-2">
      <span>{{ t('footer.byline') }}</span>
      <span>
        <a :href="info.release.url">{{ t('footer.version', { version: info.release.version }) }}</a>
        ·
        <a :href="links.releases">{{ t('footer.releases') }}</a>
        ·
        <a :href="links.github">{{ t('footer.source') }}</a>
      </span>
    </div>
  </footer>

  <p
    id="landing-viewer-hint"
    hidden
  >
    {{ t('viewer.hint') }}
  </p>
  <ScreenshotLightbox ref="viewer" />
</template>
