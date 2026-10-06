import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createI18n } from 'vue-i18n';
import { SUPPORTED_LOCALES, createI18nOptions } from '../client/src/i18n/core.js';
import sharp from 'sharp';
import { guideDiagrams, guidePresentation } from '../landing/guidePresentation.js';
import { buildGuide, githubSlug, guideSectionIds, presentationProblems, readDemoRoutes, readGuideSource } from '../landing/guideSource.js';
import { screenshotFile, screenshotNames, screenshotSizes } from '../landing/screenshots.js';
import { defaultSiteUrl, guideSourceFile, guideSourceUrl, landingRelease, links, repositoryUrl, siteUrl } from '../landing/site.js';
import { readReleaseHistory } from '../shared/releaseHistory.js';

// The landing page build facts: the announced release, the Pages address, and the documentation links.
const root = fileURLToPath(new URL('..', import.meta.url));
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const historyData = JSON.parse(read('shared/release-history.json'));
const newest = readReleaseHistory(historyData)[0];

test('the landing announces the newest release-history entry without a published tag', () => {
  assert.deepEqual(landingRelease(historyData), {
    version: newest.version,
    date: newest.date,
    url: `${repositoryUrl}/releases/tag/v${newest.version}`
  });
});

test('the landing announces the latest published tag and refuses one the history does not describe', () => {
  const history = [
    { version: '1.3.0', date: '2030-02-01', changes: ['Not published yet.'] },
    { version: '1.2.0', date: '2030-01-01', changes: ['Published.'] }
  ];
  assert.deepEqual(landingRelease(history, 'v1.2.0'), { version: '1.2.0', date: '2030-01-01', url: `${repositoryUrl}/releases/tag/v1.2.0` });
  assert.throws(() => landingRelease(history, 'v9.9.9'), /v9\.9\.9 has no valid entry/);
  assert.throws(() => landingRelease([]), /no valid release entry/);
});

test('no landing source repeats the current version by hand', () => {
  const sources = ['landing/index.html', ...fs.readdirSync(path.join(root, 'landing/src')).map(file => `landing/src/${file}`)]
    .filter(file => fs.statSync(path.join(root, file)).isFile());
  for (const file of sources) assert.ok(!read(file).includes(newest.version), `${file} hardcodes ${newest.version}`);
});

test('the site address keeps a trailing slash, which is also the asset base path', () => {
  assert.equal(siteUrl().href, defaultSiteUrl);
  assert.equal(siteUrl('').pathname, '/inventory-atlas-lite/');
  assert.equal(siteUrl('https://example.github.io/atlas').href, 'https://example.github.io/atlas/');
  assert.equal(siteUrl('https://example.github.io/atlas//').href, 'https://example.github.io/atlas/');
  assert.equal(siteUrl('https://atlas.example.org').pathname, '/');
});

test('every landing link leads to an existing part of the repository documentation', () => {
  // GitHub turns a Markdown heading into an anchor: lower case, punctuation removed, spaces to hyphens.
  const anchors = new Set(read('README.md').split('\n')
    .filter(line => /^#{1,6} /.test(line))
    .map(line => line.replace(/^#+ /, '').trim().toLowerCase().replace(/[^\w\- ]/g, '').replace(/ /g, '-')));

  assert.equal(links.github, repositoryUrl);
  assert.equal(links.releases, `${repositoryUrl}/releases`);
  for (const name of ['get', 'docker', 'manual']) {
    const [base, anchor] = links[name].split('#');
    assert.equal(base, repositoryUrl);
    assert.ok(anchors.has(anchor), `README.md has no "${anchor}" section for the ${name} link`);
  }
  assert.equal(links.get, `${repositoryUrl}#official-releases`);
  const prefix = `${repositoryUrl}/blob/master/`;
  for (const url of [links.proxmox, ...SUPPORTED_LOCALES.map(({ code }) => guideSourceUrl(code))]) {
    assert.ok(url.startsWith(prefix));
    assert.ok(fs.existsSync(path.join(root, url.slice(prefix.length))), `${url} does not exist`);
  }
  assert.equal(guideSourceUrl('en'), `${prefix}docs/HOW-TO.md`);
  assert.equal(guideSourceUrl('uk'), `${prefix}docs/HOW-TO.uk.md`);
});

// The landing messages: one file per supported locale, with exactly the same keys.
const landingMessages = Object.fromEntries(SUPPORTED_LOCALES.map(({ code }) => [code, JSON.parse(read(`landing/src/locales/${code}.json`))]));
const flatten = (value, prefix = '') => Object.entries(value).flatMap(([key, child]) =>
  child && typeof child === 'object' ? flatten(child, `${prefix}${key}.`) : [[`${prefix}${key}`, child]]);

test('every landing language defines the same messages, and each one compiles', t => {
  const english = new Map(flatten(landingMessages.en));
  const warnings = [];
  t.mock.method(console, 'warn', message => warnings.push(message));
  for (const [code, messages] of Object.entries(landingMessages)) {
    const entries = new Map(flatten(messages));
    assert.deepEqual([...entries.keys()].sort(), [...english.keys()].sort(), `${code} has the English keys`);
    const { t: translate } = createI18n(createI18nOptions({ locale: code, messages: landingMessages })).global;
    for (const [key, value] of entries) {
      assert.ok(typeof value === 'string' && value.trim(), `${code}: ${key} is empty`);
      const rendered = translate(key, { language: '<language>', version: '<version>' });
      assert.ok(rendered && rendered !== key && !rendered.includes('{'), `${code}: ${key} did not render`);
    }
  }
  assert.deepEqual(warnings, []);
});

test('the Ukrainian landing translates its copy and keeps the product and technical names', () => {
  const english = new Map(flatten(landingMessages.en));
  const unchanged = [...new Map(flatten(landingMessages.uk))].filter(([key, value]) => english.get(key) === value).map(([key]) => key);
  // Only proper names stay the same in both languages.
  assert.deepEqual(unchanged.sort(), [
    'facts.items.docker.term', 'facts.items.proxmox.term', 'facts.items.sqlite.term',
    'install.options.docker.title', 'install.options.node.title', 'install.options.proxmox.title', 'install.options.release.title'
  ]);
  for (const name of ['Inventory Atlas Lite', 'GitHub', 'Docker', 'Proxmox', 'Node.js']) {
    assert.ok(JSON.stringify(landingMessages.uk).includes(name), `the Ukrainian copy keeps ${name}`);
  }
});

test('every landing language has its whole, optimized screenshot set', () => {
  // The screenshot captions and descriptions name exactly the captured screenshots.
  assert.deepEqual(Object.keys(landingMessages.en.screenshots).sort(), [...screenshotNames].sort());
  for (const { code } of SUPPORTED_LOCALES) {
    for (const name of screenshotNames) {
      const file = path.join(root, screenshotFile(code, name));
      assert.ok(fs.existsSync(file), `${screenshotFile(code, name)} exists`);
      const bytes = fs.readFileSync(file);
      assert.equal(bytes.toString('latin1', 8, 12), 'WEBP', `${code}/${name} is a WebP image`);
      assert.ok(bytes.length < 200 * 1024, `${code}/${name} is optimized for the web`);
    }
    const dir = path.dirname(path.join(root, screenshotFile(code, 'items')));
    assert.deepEqual(fs.readdirSync(dir).sort(), screenshotNames.map(name => `${name}.webp`).sort(), `${code} has no stray screenshots`);
  }
});

test('the page reserves the real size of every screenshot in every language', async () => {
  assert.deepEqual(Object.keys(screenshotSizes).sort(), [...screenshotNames].sort());
  for (const { code } of SUPPORTED_LOCALES) {
    for (const name of screenshotNames) {
      const { width, height } = await sharp(path.join(root, screenshotFile(code, name))).metadata();
      assert.deepEqual([width, height], screenshotSizes[name], `${code}/${name} is ${width} × ${height}`);
    }
  }
});

// The public user guide, rendered from docs/HOW-TO.md and its translations (landing/guideSource.js).
const guides = Object.fromEntries(SUPPORTED_LOCALES.map(({ code }) => [code, buildGuide(code)]));
const markdownHeadings = (text, level) => text.split('\n').filter(line => line.startsWith(`${'#'.repeat(level)} `)).map(line => line.slice(level + 1).trim());
const withoutNumber = heading => heading.replace(/^\d+\.\s+/, '');

test('the English guide is built from docs/HOW-TO.md and every other language from its own translation', () => {
  assert.equal(guideSourceFile('en'), 'docs/HOW-TO.md');
  assert.equal(guideSourceFile('uk'), 'docs/HOW-TO.uk.md');
  for (const [code, guide] of Object.entries(guides)) {
    const source = read(guideSourceFile(code));
    assert.equal(guide.source, guideSourceFile(code));
    assert.equal(guide.title, markdownHeadings(source, 1)[0]);
    assert.deepEqual(guide.sections.map(section => section.title), markdownHeadings(source, 2).map(withoutNumber), `${code} sections`);
    assert.deepEqual(guide.sections.flatMap(section => section.subsections.map(sub => sub.title)), markdownHeadings(source, 3), `${code} subsections`);
  }
  // The English text is the canonical one, never a copy of the translation.
  assert.ok(guides.en.sections.some(section => section.title === 'Core concepts'));
  assert.ok(guides.uk.sections.some(section => section.title === 'Основні поняття'));
  assert.match(guides.uk.intro, /Короткий посібник/);
});

test('every language has the same guide sections under the same stable ids', () => {
  const english = guideSectionIds(guides.en);
  assert.equal(new Set(english).size, english.length, 'the section ids are unique');
  // The ids come from the English headings, without their section numbers.
  assert.deepEqual(guides.en.sections.map(section => section.id).slice(0, 4),
    ['what-inventory-atlas-lite-does', 'before-you-start', 'recommended-first-setup', 'core-concepts']);
  for (const id of ['read-and-filter-the-dashboard', 'browse-the-storage-hierarchy', 'pack-or-verify-items-with-a-checklist', 'backup-and-data-safety']) {
    assert.ok(english.includes(id), `the guide has the ${id} section`);
  }
  for (const [code, guide] of Object.entries(guides)) {
    assert.deepEqual(guideSectionIds(guide), english, `${code} has the canonical section ids`);
    assert.deepEqual(guide.sections.map(section => section.number), guides.en.sections.map(section => section.number), `${code} section numbers`);
  }
});

test('a translation that drifts from the canonical guide structure fails the guide build', () => {
  const english = readGuideSource('en');
  const ukrainian = readGuideSource('uk');
  const build = edit => () => buildGuide('uk', locale => (locale === 'uk' ? edit(ukrainian) : english));

  assert.throws(build(text => text.replace(/\n### Дублювати предмет\n[\s\S]*?(?=\n### )/, '\n')), /docs\/HOW-TO\.uk\.md has \d+ sections, docs\/HOW-TO\.md has \d+/);
  assert.throws(build(text => text.replace('### Створити предмет\n', '## Створити предмет\n')), /the section "Створити предмет" has no number/);
  assert.throws(build(text => text.replace('## 6. Практичний приклад\n', '### 6. Практичний приклад\n')), /is a level 3 heading, not 2/);
  assert.throws(build(text => text.replace('## 4. Основні поняття', '## 5. Основні поняття')), /has another section number/);
  assert.throws(build(text => text.replace(/\n {3}```json\n[\s\S]*?\n {3}```\n/, '\n')), /has 0 code blocks instead of 1/);
  assert.throws(build(text => text.replace('| Поняття | Що воно означає |', 'Поняття')), /tables instead of/);
  assert.throws(build(text => text.replace('(#змінити-мову-інтерфейсу)', '(#немає-такого-розділу)')), /links to #немає-такого-розділу/);
  // Paragraphs are free: a translation may word every section its own way.
  assert.doesNotThrow(build(text => text.replace('Короткий посібник для тих', 'Стислий посібник для тих')));
});

test('the guide renders Markdown safely and sends repository links to GitHub', () => {
  const english = readGuideSource('en');
  const guide = buildGuide('en', () => english.replace('## 2. Before you start\n', '## 2. Before you start\n\n<script>alert(1)</script> <img src=x onerror=alert(1)>\n'));
  const html = guide.sections[1].html;
  assert.ok(!html.includes('<script>') && !html.includes('<img'), 'raw HTML stays text');
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);

  for (const guideOfLocale of Object.values(guides)) {
    const all = [guideOfLocale.intro, ...guideOfLocale.sections.flatMap(section => [section.html, ...section.subsections.map(sub => sub.html)])].join('\n');
    assert.ok(all.includes(`href="${repositoryUrl}/blob/master/docs/proxmox.md"`), 'proxmox.md opens on GitHub');
    assert.ok(all.includes(`href="${repositoryUrl}/blob/master/docs/proxmox.md#updating"`));
    // In-page links point at the canonical section ids, in every language.
    assert.ok(all.includes('href="#change-the-interface-language"'));
    assert.ok(all.includes('href="#select-items-and-print-qr-labels"'));
    for (const [, href] of all.matchAll(/href="([^"]+)"/g)) assert.match(href, /^(https:\/\/|#)/, `${href} is absolute or in-page`);
    // Tables and code blocks scroll inside their own keyboard-reachable box.
    assert.ok(all.includes('<div class="guide-scroll" tabindex="0">\n<table>'));
    assert.ok(all.includes('<pre tabindex="0"><code class="language-json">'));
  }
  assert.equal(githubSlug('Switch between light and dark mode'), 'switch-between-light-and-dark-mode');
  assert.equal(githubSlug('Змінити мову інтерфейсу'), 'змінити-мову-інтерфейсу');
  assert.equal(githubSlug("What's New after an update"), 'whats-new-after-an-update');
});

test('the guide presentation metadata names real sections, screenshots, diagrams, and demo pages', () => {
  const demo = readDemoRoutes();
  const context = { screenshots: screenshotNames, diagrams: guideDiagrams, demoRoutes: demo.routes, demoUnavailable: demo.unavailable };
  assert.deepEqual(presentationProblems(guides.en, guidePresentation, context), []);

  // The demo pages come from the application routes; server-only features are never offered.
  for (const route of ['/dashboard', '/items', '/items/new', '/hierarchy', '/templates', '/checklists', '/categories', '/settings/interface']) {
    assert.ok(demo.routes.includes(route), `the demo has ${route}`);
  }
  assert.deepEqual([...demo.unavailable].sort(), ['/data', '/items/ai', '/settings/ai', '/settings/cloud-backup']);
  for (const id of [
    'download-a-backup', 'back-up-to-dropbox-or-google-drive', 'restore-a-backup', 'reset-the-inventory-database',
    'check-for-a-newer-version-and-update', 'let-ai-suggest-the-fields-for-a-category', 'create-an-item-from-a-photo-or-a-description-with-ai'
  ]) {
    assert.equal(guidePresentation[id]?.selfHosted, true, `${id} says it needs a self-hosted installation`);
    assert.equal(guidePresentation[id].demo, undefined, `${id} offers no demo`);
  }

  assert.deepEqual(presentationProblems(guides.en, {
    'no-such-section': {},
    'core-concepts': { screenshot: 'no-such-shot', diagrams: ['no-such-diagram'] },
    'restore-a-backup': { demo: '/data' },
    'create-an-item': { demo: '/nowhere' },
    'download-a-backup': { demo: '/items', selfHosted: true }
  }, context), [
    '"no-such-section" is not a section of the guide',
    '"core-concepts" shows the unknown screenshot "no-such-shot"',
    '"core-concepts" draws the unknown diagram "no-such-diagram"',
    '"restore-a-backup" opens "/data", which the public demo cannot show',
    '"create-an-item" opens "/nowhere", which is not a demo page',
    '"download-a-backup" cannot both open the demo and need a self-hosted installation'
  ]);
  // Every diagram has its words in every landing language.
  for (const name of guideDiagrams) assert.ok(landingMessages.en.guide.diagrams[name].steps.length >= 2, `${name} has steps`);
});

test('no landing source repeats the guide text, which comes only from the Markdown', () => {
  const sources = [];
  const walk = dir => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      const file = `${dir}/${entry.name}`;
      if (entry.isDirectory()) { if (entry.name !== 'assets') walk(file); } else if (/\.(js|vue|json|html|css)$/.test(entry.name)) sources.push(file);
    }
  };
  walk('landing');
  const text = sources.map(read).join('\n');
  for (const code of SUPPORTED_LOCALES.map(({ code }) => code)) {
    const sentences = read(guideSourceFile(code)).split(/(?<=[.!?])\s+|\n/).map(line => line.trim()).filter(line => line.length > 50 && !line.startsWith('|'));
    assert.ok(sentences.length > 200, `${code} has prose`);
    for (const sentence of sentences) assert.ok(!text.includes(sentence), `a landing source repeats "${sentence}"`);
  }
});
