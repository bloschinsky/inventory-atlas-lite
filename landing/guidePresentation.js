/*
  The presentation layer of the public user guide, keyed by guide section id (the id of the English
  heading in docs/HOW-TO.md, see landing/guideSource.js). It never holds guide text: the Markdown is
  the only source of the words, and this map only decides what a section shows around them.

  - screenshot: a landing screenshot name (landing/screenshots.js), shown in the page language;
  - phone: the screenshot is a phone capture;
  - diagrams: small text diagrams (landing/src/GuideDiagram.vue), worded in guide.diagrams.<name>;
  - demo: a hash route of the public demo for "Try this in Demo", only for what the demo really does;
  - selfHosted: the section needs a real installation, which a short note says instead.

  The landing build and test/landing.test.js refuse an unknown section, screenshot, diagram, or demo
  route, and a demo route the public demo cannot show.
*/
export const guideDiagrams = ['containment', 'fields', 'backup'];

export const guidePresentation = {
  'what-inventory-atlas-lite-does': { screenshot: 'items', demo: '/dashboard' },
  'core-concepts': { diagrams: ['containment', 'fields'] },
  'read-and-filter-the-dashboard': { screenshot: 'dashboard', demo: '/dashboard' },
  'create-and-rename-a-category': { demo: '/categories' },
  'add-and-manage-custom-fields': { demo: '/categories' },
  'add-several-fields-at-once': { demo: '/categories' },
  'let-ai-suggest-the-fields-for-a-category': { selfHosted: true },
  'create-an-item': { screenshot: 'item-details', demo: '/items/new' },
  'retire-an-item-and-restore-it': { demo: '/items' },
  'save-and-use-item-templates': { demo: '/templates' },
  'pack-or-verify-items-with-a-checklist': { screenshot: 'checklist-run-phone', phone: true, demo: '/checklists' },
  'add-several-items-at-once-from-json': { demo: '/items' },
  'create-an-item-from-a-photo-or-a-description-with-ai': { selfHosted: true },
  'show-the-qr-code-of-an-item': { screenshot: 'item-phone', phone: true },
  'select-items-and-print-qr-labels': { screenshot: 'labels', demo: '/items' },
  'search-filter-sort-and-page-through-items': { screenshot: 'items-search', demo: '/items' },
  'move-several-items-into-a-container-at-once': { demo: '/items' },
  'browse-the-storage-hierarchy': { screenshot: 'hierarchy', demo: '/hierarchy' },
  'change-the-interface-language': { demo: '/settings/interface' },
  'name-the-database': { demo: '/settings/database' },
  'download-a-backup': { selfHosted: true },
  'back-up-to-dropbox-or-google-drive': { selfHosted: true },
  'restore-a-backup': { selfHosted: true },
  'reset-the-inventory-database': { selfHosted: true },
  'check-for-a-newer-version-and-update': { selfHosted: true },
  'backup-and-data-safety': { diagrams: ['backup'] }
};
