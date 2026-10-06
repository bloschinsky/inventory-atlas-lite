/*
  The public user guide, rendered at build time from the repository's user documentation:
  docs/HOW-TO.md is the canonical English guide and docs/HOW-TO.<locale>.md its translation for every
  other supported locale. landing/vite.config.js serves the result to the guide page as the
  virtual:guide modules, and test/landing.test.js checks it. Nothing of the guide text is copied into
  the landing sources: a change to the Markdown reaches the page with the next landing build.

  A translation must keep the canonical structure: the same headings at the same levels in the same
  order, the same top-level numbers, and the same tables and code blocks in every section. Its
  headings get the section ids of the English headings at the same place, so an anchor such as
  #browse-the-storage-hierarchy names the same section in every language. Any drift fails the build
  with the section it was found in.
*/
import fs from 'node:fs';
import MarkdownIt from 'markdown-it';
import { guideSourceFile, repositoryUrl } from './site.js';

const root = new URL('../', import.meta.url);
export const readGuideSource = locale => fs.readFileSync(new URL(guideSourceFile(locale), root), 'utf8');

// GitHub's heading anchor: lower case, punctuation removed, spaces turned into hyphens.
export const githubSlug = text => text.trim().toLowerCase().replace(/[^\p{L}\p{N}\- _]/gu, '').replace(/ /g, '-');

// "4. Core concepts" is shown as the section number 4 and the title "Core concepts".
const splitNumber = text => {
  const match = text.match(/^(\d+)\.\s+(.*)$/);
  return match ? { number: Number(match[1]), title: match[2] } : { number: null, title: text };
};

// Relative links lead to the document's neighbours in the repository on GitHub.
const docsUrl = `${repositoryUrl}/blob/master/docs/`;

// Raw HTML in the Markdown is shown as text, never executed.
const md = new MarkdownIt({ html: false, linkify: false });

// Tables and code blocks scroll sideways inside their own box, which the keyboard can reach.
const renderToken = (tokens, index, options, env, self) => self.renderToken(tokens, index, options);
md.renderer.rules.table_open = (...args) => `<div class="guide-scroll" tabindex="0">\n${renderToken(...args)}`;
md.renderer.rules.table_close = (...args) => `${renderToken(...args)}</div>\n`;
const fence = md.renderer.rules.fence;
md.renderer.rules.fence = (...args) => fence(...args).replace('<pre>', '<pre tabindex="0">');

md.renderer.rules.link_open = (tokens, index, options, env, self) => {
  const token = tokens[index];
  const href = token.attrGet('href');
  if (href.startsWith('#')) {
    // markdown-it percent-encodes the link, so a Cyrillic anchor is decoded before the lookup.
    const anchor = decodeURIComponent(href.slice(1));
    const id = env.anchors.get(anchor);
    if (!id) throw new Error(`${env.file} links to #${anchor}, which is not a heading of the guide.`);
    token.attrSet('href', `#${id}`);
  } else if (!/^[a-z][a-z\d+.-]*:/i.test(href)) {
    token.attrSet('href', new URL(href, docsUrl).href);
  }
  return self.renderToken(tokens, index, options);
};

const plainText = inline => inline.children
  .filter(child => child.type === 'text' || child.type === 'code_inline')
  .map(child => child.content)
  .join('')
  .trim();

// The headings of the document and the token range of the body under each one.
function outline(tokens) {
  const headings = [];
  tokens.forEach((token, index) => {
    if (token.type === 'heading_open') headings.push({ level: Number(token.tag.slice(1)), text: plainText(tokens[index + 1]), start: index });
  });
  headings.forEach((heading, index) => {
    heading.bodyStart = heading.start + 3;
    heading.bodyEnd = headings[index + 1]?.start ?? tokens.length;
    const body = tokens.slice(heading.bodyStart, heading.bodyEnd);
    heading.tables = body.filter(token => token.type === 'table_open').length;
    heading.codeBlocks = body.filter(token => token.type === 'fence').length;
  });
  return headings;
}

// The guide expects one title, then numbered sections (##) that may hold subsections (###).
function checkShape(headings, file) {
  if (headings[0]?.level !== 1 || headings.filter(heading => heading.level === 1).length !== 1) {
    throw new Error(`${file} must start with exactly one # title.`);
  }
  for (const heading of headings.slice(1)) {
    if (heading.level !== 2 && heading.level !== 3) throw new Error(`${file}: "${heading.text}" must be a ## or ### heading.`);
    if (heading.level === 2 && splitNumber(heading.text).number === null) throw new Error(`${file}: the section "${heading.text}" has no number.`);
  }
  if (headings[1]?.level !== 2) throw new Error(`${file}: the first heading after the title must be a ## section.`);
}

// The canonical English outline: section ids, from the English headings without their numbers.
function canonicalIds(headings) {
  const ids = headings.map((heading, index) => (index === 0 ? null : githubSlug(splitNumber(heading.text).title)));
  const duplicate = ids.find((id, index) => id && ids.indexOf(id) !== index);
  if (duplicate) throw new Error(`docs/HOW-TO.md has two sections with the id "${duplicate}".`);
  return ids;
}

// A translation must match the canonical outline heading by heading.
function checkParity(headings, english, file) {
  if (headings.length !== english.length) {
    throw new Error(`${file} has ${headings.length - 1} sections, docs/HOW-TO.md has ${english.length - 1}; translate the missing or extra sections.`);
  }
  english.forEach((canonical, index) => {
    const heading = headings[index];
    const where = `${file}: "${heading.text}" (docs/HOW-TO.md: "${canonical.text}")`;
    if (heading.level !== canonical.level) throw new Error(`${where} is a level ${heading.level} heading, not ${canonical.level}.`);
    if (splitNumber(heading.text).number !== splitNumber(canonical.text).number) throw new Error(`${where} has another section number.`);
    if (heading.tables !== canonical.tables) throw new Error(`${where} has ${heading.tables} tables instead of ${canonical.tables}.`);
    if (heading.codeBlocks !== canonical.codeBlocks) throw new Error(`${where} has ${heading.codeBlocks} code blocks instead of ${canonical.codeBlocks}.`);
  });
}

function parse(locale, read) {
  const file = guideSourceFile(locale);
  const tokens = md.parse(read(locale), {});
  const headings = outline(tokens);
  checkShape(headings, file);
  return { file, tokens, headings };
}

/*
  The guide of one locale: { locale, source, title, intro, sections: [{ id, number, title, html,
  subsections: [{ id, title, html }] }] }, with the body of every heading rendered to HTML. `read`
  returns the Markdown of a locale; the tests pass edited documents through it.
*/
export function buildGuide(locale, read = readGuideSource) {
  const english = parse('en', read);
  const ids = canonicalIds(english.headings);
  const { file, tokens, headings } = locale === 'en' ? english : parse(locale, read);
  if (locale !== 'en') checkParity(headings, english.headings, file);

  // In-page links may use the section id or GitHub's anchor of the heading in this document.
  const anchors = new Map();
  headings.forEach((heading, index) => {
    if (!ids[index]) return;
    anchors.set(ids[index], ids[index]);
    anchors.set(githubSlug(heading.text), ids[index]);
  });
  const env = { anchors, file };
  const render = (start, end) => md.renderer.render(tokens.slice(start, end), md.options, env).trim();

  const [title, ...rest] = headings;
  const sections = [];
  rest.forEach((heading, offset) => {
    const id = ids[offset + 1];
    const html = render(heading.bodyStart, heading.bodyEnd);
    if (heading.level === 2) sections.push({ id, ...splitNumber(heading.text), html, subsections: [] });
    else sections.at(-1).subsections.push({ id, title: heading.text, html });
  });
  return { locale, source: file, title: title.text, intro: render(title.bodyStart, title.bodyEnd), sections };
}

/*
  The pages of the static public demo, read from the application's route table and Settings
  sections: `routes` are its fixed paths, `unavailable` the ones it replaces with "Not available in
  the public demo" — the Data / Backup page, AI Add Item (no AI provider), and every server-only
  Settings section.
*/
export function readDemoRoutes() {
  const read = file => fs.readFileSync(new URL(file, root), 'utf8');
  const settings = [...read('client/src/settingsSections.js').matchAll(/\{ path: '([\w-]+)'([^\n]*)/g)]
    .map(([, path, rest]) => ({ path: `/settings/${path}`, serverOnly: /serverOnly: true/.test(rest) }));
  const routes = [...read('client/src/main.js').matchAll(/path: '(\/[^':]*)'/g)].map(([, path]) => path).filter(path => path !== '/');
  return {
    routes: [...routes, ...settings.map(section => section.path)],
    unavailable: ['/data', '/items/ai', ...settings.filter(section => section.serverOnly).map(section => section.path)]
  };
}

export const guideSectionIds = guide => guide.sections.flatMap(section => [section.id, ...section.subsections.map(sub => sub.id)]);

/*
  Problems of the presentation metadata (landing/guidePresentation.js) against a built guide: a
  section that does not exist, an unknown screenshot or diagram, and a demo route that is not a page
  of the static demo or that the demo cannot show.
*/
export function presentationProblems(guide, presentation, { screenshots, diagrams, demoRoutes, demoUnavailable }) {
  const ids = new Set(guideSectionIds(guide));
  const problems = [];
  for (const [id, entry] of Object.entries(presentation)) {
    if (!ids.has(id)) problems.push(`"${id}" is not a section of the guide`);
    if (entry.screenshot && !screenshots.includes(entry.screenshot)) problems.push(`"${id}" shows the unknown screenshot "${entry.screenshot}"`);
    for (const diagram of entry.diagrams ?? []) if (!diagrams.includes(diagram)) problems.push(`"${id}" draws the unknown diagram "${diagram}"`);
    if (entry.demo && !demoRoutes.includes(entry.demo)) problems.push(`"${id}" opens "${entry.demo}", which is not a demo page`);
    if (entry.demo && demoUnavailable.includes(entry.demo)) problems.push(`"${id}" opens "${entry.demo}", which the public demo cannot show`);
    if (entry.demo && entry.selfHosted) problems.push(`"${id}" cannot both open the demo and need a self-hosted installation`);
  }
  return problems;
}
