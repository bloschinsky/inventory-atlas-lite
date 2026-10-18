/*
  The editable layouts of the social preview cards. `cardHtml()` builds the body of one card from
  its page, the copy under `social.<page>` in landing/src/locales/<locale>.json, the localized demo
  screenshots, and, for the Guide, the section titles of the localized user guide. Every locale of a
  page shares one composition; only the text and the screenshots change. The styles are in card.css.
*/

// The product mark of client/src/components/AppBrand.vue.
const mark = '<svg viewBox="0 0 24 24" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.5 21 7v10l-9 4.5L3 17V7l9-4.5Z"/><path d="M3 7l9 4.5L21 7M12 11.5V21"/></g></svg>';

// Tabler icons (outline): server, book, and player-play.
const icon = paths => `<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths.map(d => `<path d="${d}"/>`).join('')}</svg>`;
const icons = {
  landing: icon(['M3 7a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z', 'M3 15a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v2a3 3 0 0 1 -3 3h-12a3 3 0 0 1 -3 -3z', 'M7 8v.01', 'M7 16v.01']),
  guide: icon(['M3 19a9 9 0 0 1 9 0a9 9 0 0 1 9 0', 'M3 6a9 9 0 0 1 9 0a9 9 0 0 1 9 0', 'M3 6v13', 'M12 6v13', 'M21 6v13']),
  demo: icon(['M7 4v16l13 -8z'])
};

// The screenshots each card shows, by name from landing/screenshots.js.
export const cardScreenshots = {
  landing: ['items', 'item-phone'],
  guide: ['hierarchy'],
  demo: ['dashboard', 'checklist-run-phone']
};

// The number of guide sections listed on the Guide card's contents page.
const guideSectionCount = 8;

const escape = text => String(text).replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[char]);

const visuals = {
  landing: ({ shots }) => `
    <img class="shot" src="${shots.items}" alt="">
    <div class="phone"><img src="${shots['item-phone']}" alt=""></div>`,
  guide: ({ shots, copy, guide }) => `
    <img class="shot" src="${shots.hierarchy}" alt="">
    <div class="manual">
      <div class="manual-head">${icons.guide}${escape(copy.contents)}</div>
      <ol>${guide.sections.slice(0, guideSectionCount).map(section => `<li><span>${section.number}</span><span>${escape(section.title)}</span></li>`).join('')}</ol>
    </div>`,
  demo: ({ shots }) => `
    <div class="window"><div class="window-bar"><i></i><i></i><i></i></div><img src="${shots.dashboard}" alt=""></div>
    <div class="phone"><img src="${shots['checklist-run-phone']}" alt=""></div>`
};

export function cardHtml(page, { copy, shots, guide }) {
  return `
  <main class="card card-${page}">
    <div class="copy">
      <div class="brand">${mark}Inventory Atlas Lite</div>
      <div class="eyebrow"><span class="eyebrow-icon">${icons[page]}</span>${escape(copy.eyebrow)}</div>
      <h1 class="title">${escape(copy.title)}</h1>
      ${copy.text ? `<p class="text">${escape(copy.text)}</p>` : ''}
      ${copy.tagline ? `<p class="tagline">${escape(copy.tagline)}</p>` : ''}
    </div>
    ${visuals[page]({ shots, copy, guide })}
  </main>`;
}
