<script setup>
import { onBeforeUnmount, onMounted } from 'vue';
import { IconBook, IconBrandGithub, IconPlayerPlay, IconRocket } from '@tabler/icons-vue';
import FeatureSection from './FeatureSection.vue';
import { links } from '../site.js';
import { hero, info, installOptions, principles, sections } from './content.js';

// The history stores calendar dates; UTC keeps the day from shifting in the visitor's time zone.
const releaseDate = info.release.date
  ? new Intl.DateTimeFormat('en', { dateStyle: 'long', timeZone: 'UTC' }).format(new Date(`${info.release.date}T00:00:00Z`))
  : null;

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
  >Skip to content</a>

  <nav
    class="landing-nav landing-dark navbar"
    data-bs-theme="dark"
    aria-label="Main"
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
      <div class="d-flex align-items-center gap-3">
        <a
          class="landing-nav-link d-none d-md-inline"
          href="#hierarchy"
        >Features</a>
        <a
          class="landing-nav-link d-none d-md-inline"
          href="#install"
        >Install</a>
        <a
          class="btn btn-outline-secondary"
          :href="links.github"
        >
          <IconBrandGithub
            class="icon"
            aria-hidden="true"
          />
          <span>GitHub</span>
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
              Self-hosted inventory for physical items
            </p>
            <h1 class="landing-title">
              Inventory Atlas Lite
            </h1>
            <p class="landing-lead">
              Know what you own and where it is. A deliberately small inventory app that runs on your
              own server and keeps every item, field, and photo in a database you control.
            </p>
            <div class="landing-actions">
              <a
                class="btn btn-primary btn-lg"
                :href="links.get"
              >Get Inventory Atlas Lite</a>
              <a
                class="btn btn-outline-secondary btn-lg"
                :href="links.github"
              >
                <IconBrandGithub
                  class="icon"
                  aria-hidden="true"
                />
                View on GitHub
              </a>
              <a
                v-if="info.demoUrl"
                class="btn btn-outline-primary btn-lg"
                :href="info.demoUrl"
              >
                <IconPlayerPlay
                  class="icon"
                  aria-hidden="true"
                />
                Try Demo
              </a>
            </div>
            <p
              class="landing-release"
              data-testid="release"
            >
              Latest release
              <a :href="info.release.url">v{{ info.release.version }}</a>
              <template v-if="releaseDate">
                · {{ releaseDate }}
              </template>
            </p>
          </div>
          <div class="col-lg-7">
            <div class="landing-hero-media">
              <img
                class="landing-shot"
                :src="hero.desktop.src"
                :alt="hero.desktop.alt"
                fetchpriority="high"
              >
              <img
                class="landing-shot landing-shot-phone landing-hero-phone"
                :src="hero.phone.src"
                :alt="hero.phone.alt"
              >
            </div>
          </div>
        </div>
      </div>
    </header>

    <section
      class="landing-principles landing-dark"
      data-bs-theme="dark"
      aria-labelledby="principles-title"
    >
      <div class="container-xl">
        <h2
          id="principles-title"
          class="visually-hidden"
        >
          Your server, your data
        </h2>
        <div class="row g-4">
          <div
            v-for="(principle, index) in principles"
            :key="principle.title"
            class="col-sm-6 col-lg-3 landing-reveal"
            :style="{ '--landing-reveal-delay': `${index * 0.08}s` }"
          >
            <div class="landing-principle">
              <component
                :is="principle.icon"
                class="landing-principle-icon"
                aria-hidden="true"
              />
              <h3 class="h4 mb-1">
                {{ principle.title }}
              </h3>
              <p class="text-secondary mb-0">
                {{ principle.text }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <FeatureSection
      v-for="(section, index) in sections"
      :key="section.id"
      :section="section"
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
            Install
          </p>
          <h2
            id="install-title"
            class="landing-section-title"
          >
            Choose how to run it
          </h2>
          <p class="landing-text">
            Inventory Atlas Lite is self-hosted software, not a hosted service. Pick the path that fits
            your setup; the repository documentation has the full instructions.
          </p>
        </div>
        <div class="row g-4">
          <div
            v-for="(option, index) in installOptions"
            :key="option.title"
            class="col-sm-6 col-lg-3 landing-reveal"
            :style="{ '--landing-reveal-delay': `${index * 0.08}s` }"
          >
            <div class="card h-100">
              <div class="card-body d-flex flex-column">
                <component
                  :is="option.icon"
                  class="landing-principle-icon"
                  aria-hidden="true"
                />
                <h3 class="card-title mb-2">
                  {{ option.title }}
                </h3>
                <p class="text-secondary">
                  {{ option.text }}
                </p>
                <a
                  class="mt-auto"
                  :href="option.link"
                >{{ option.label }}</a>
              </div>
            </div>
          </div>
        </div>
        <p class="landing-note">
          There are no user accounts: keep Inventory Atlas Lite on a trusted home network or reach it
          through a VPN such as Tailscale.
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
          Start your inventory today
        </h2>
        <p class="landing-text mx-auto">
          Install it on your own hardware, add the first few items, and find them again in seconds.
        </p>
        <div class="landing-actions justify-content-center">
          <a
            class="btn btn-primary btn-lg"
            :href="links.get"
          >Get Inventory Atlas Lite</a>
          <a
            class="btn btn-outline-secondary btn-lg"
            :href="links.github"
          >
            <IconBrandGithub
              class="icon"
              aria-hidden="true"
            />
            View on GitHub
          </a>
          <a
            class="btn btn-ghost-secondary btn-lg"
            :href="links.guide"
          >
            <IconBook
              class="icon"
              aria-hidden="true"
            />
            Read the user guide
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
      <span>Inventory Atlas Lite · by Artem Bloschinsky</span>
      <span>
        <a :href="info.release.url">Version {{ info.release.version }}</a>
        ·
        <a :href="links.releases">All releases</a>
        ·
        <a :href="links.github">Source on GitHub</a>
      </span>
    </div>
  </footer>
</template>
