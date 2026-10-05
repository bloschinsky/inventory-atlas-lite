/*
  The canonical inventory of the public demo. Every name, value, serial number, and photo is invented
  for the showcase; the photos in ./photos/ are generated images made for this project. The seed in
  ./seed.js loads it through the real services, so it always passes the current validation rules.

  Items are keyed by `key` and get the fixed UUID `demoUuid(index)`, so links, tests, and a guided
  tour can rely on them. `addedDaysAgo` dates each item relative to the visit, which keeps the
  Dashboard's 30-day window populated whenever the demo is opened.
*/

// A valid version 4 UUID that only differs in its last group: d3e00000-0000-4000-8000-000000000001, ...
export const demoUuid = index => `d3e00000-0000-4000-8000-${String(index).padStart(12, '0')}`;

export const DEMO_DATABASE_NAME = 'Inventory Atlas Demo';

export const categories = [
  { name: 'Storage', fields: [{ name: 'Material', type: 'text' }, { name: 'Labeled', type: 'boolean' }] },
  { name: 'Photography', fields: [{ name: 'Mount', type: 'text' }, { name: 'Format', type: 'text' }, { name: 'Last tested', type: 'date' }] },
  { name: 'Electronics', fields: [{ name: 'Capacity', type: 'text' }, { name: 'Connector', type: 'text' }, { name: 'Warranty until', type: 'date' }] },
  { name: 'Tools', fields: [{ name: 'Power source', type: 'text' }, { name: 'Voltage', type: 'number' }] },
  { name: 'Travel & Outdoor', fields: [{ name: 'Weight (g)', type: 'number' }, { name: 'Waterproof', type: 'boolean' }] },
  { name: 'Archive', fields: [{ name: 'Years covered', type: 'text' }, { name: 'Digitized', type: 'boolean' }] }
];

/*
  Containers come first, so every `parent` names an item that already exists. Only a top-level item
  has a location; the items inside a container inherit the container's.
*/
export const items = [
  {
    key: 'camera-bag', name: 'Camera Bag', category: 'Storage', location: 'Home / Office', addedDaysAgo: 58,
    description: 'Padded shoulder bag that holds the film kit.', condition_grade: 'good',
    fields: { Material: 'Waxed canvas', Labeled: true }
  },
  {
    key: 'electronics-drawer', name: 'Electronics Drawer', category: 'Storage', location: 'Home / Office', addedDaysAgo: 57,
    description: 'Top drawer of the office desk.', fields: { Material: 'Wood', Labeled: true }
  },
  {
    key: 'tool-cabinet', name: 'Tool Cabinet', category: 'Storage', location: 'Workshop', addedDaysAgo: 56,
    description: 'Wall-mounted cabinet with two shelves.', condition_grade: 'fair', condition_notes: 'Lower hinge squeaks.',
    fields: { Material: 'Steel', Labeled: false }
  },
  {
    key: 'camping-box', name: 'Camping Box', category: 'Storage', location: 'Travel gear', addedDaysAgo: 55,
    description: 'Stackable box packed for weekend trips.', fields: { Material: 'Plastic', Labeled: true }
  },
  {
    key: 'archive-box', name: 'Archive Box', category: 'Storage', location: 'Home / Storage', addedDaysAgo: 54,
    description: 'Acid-free box on the storage room shelf.', fields: { Material: 'Cardboard', Labeled: true }
  },
  {
    key: 'nikon-f65', name: 'Nikon F65', category: 'Photography', parent: 'camera-bag', addedDaysAgo: 40, photo: 'nikon-f65.webp',
    description: '35mm film SLR body.', condition_grade: 'good', condition_notes: 'Light wear on the grip; shutter tested.',
    serial_number: 'F65-2481937', purchase_date: '2021-05-14', purchase_price: { amount: '120.00', currency: 'EUR' },
    fields: { Mount: 'Nikon F', Format: '35mm film', 'Last tested': '2026-08-23' }
  },
  {
    key: 'nikkor-50mm', name: 'Nikkor 50mm f/1.8 lens', category: 'Photography', parent: 'camera-bag', addedDaysAgo: 39,
    photo: 'nikkor-50mm.webp', description: 'Standard prime lens with front and rear caps.', condition_grade: 'excellent',
    serial_number: 'NK50-3318420', purchase_date: '2021-06-02', purchase_price: { amount: '85.00', currency: 'EUR' },
    fields: { Mount: 'Nikon F' }
  },
  {
    key: 'speedlight', name: 'Speedlight flash', category: 'Photography', parent: 'camera-bag', addedDaysAgo: 24, photo: 'speedlight.webp',
    description: 'Hot-shoe flash with a tilting head.', condition_grade: 'fair', condition_notes: 'Battery door latch is loose.',
    purchase_date: '2022-02-11', purchase_price: { amount: '45.00', currency: 'EUR' }, fields: { Mount: 'Nikon F' }
  },
  {
    key: 'film-rolls', name: 'Film rolls (5 pack)', category: 'Photography', parent: 'camera-bag', addedDaysAgo: 3, photo: 'film-rolls.webp',
    description: 'ISO 400 color negative film.', is_new: true, purchase_date: '2026-09-28',
    purchase_price: { amount: '42.50', currency: 'EUR' }, fields: { Format: '35mm film' }
  },
  {
    key: 'power-bank', name: 'Power bank 20,000 mAh', category: 'Electronics', parent: 'electronics-drawer', addedDaysAgo: 12,
    photo: 'power-bank.webp', description: 'Charges a phone about four times.', is_new: true, condition_grade: 'excellent',
    purchase_date: '2026-09-15', purchase_price: { amount: '39.90', currency: 'EUR' },
    fields: { Capacity: '20,000 mAh', Connector: 'USB-C', 'Warranty until': '2028-09-15' }
  },
  {
    key: 'usb-c-charger', name: 'USB-C charger 65 W', category: 'Electronics', parent: 'electronics-drawer', addedDaysAgo: 20,
    photo: 'usb-c-charger.webp', description: 'Two-port wall charger.', condition_grade: 'good',
    purchase_date: '2025-11-03', purchase_price: { amount: '29.00', currency: 'EUR' }, fields: { Connector: 'USB-C' }
  },
  {
    key: 'portable-ssd', name: 'Portable SSD 1 TB', category: 'Electronics', parent: 'electronics-drawer', addedDaysAgo: 33,
    photo: 'portable-ssd.webp', description: 'Photo scans and the offline backup copy.', condition_grade: 'good',
    serial_number: 'PSSD-1T-58210', purchase_date: '2025-03-01', purchase_price: { amount: '89.00', currency: 'EUR' },
    fields: { Capacity: '1 TB', Connector: 'USB-C', 'Warranty until': '2028-03-01' }
  },
  {
    key: 'hdmi-adapter', name: 'HDMI/USB adapter', category: 'Electronics', addedDaysAgo: 8,
    description: 'Not put away yet after the last presentation.', condition_grade: 'fair', fields: { Connector: 'USB-C' }
  },
  {
    key: 'multimeter', name: 'Digital multimeter', category: 'Tools', parent: 'tool-cabinet', addedDaysAgo: 45, photo: 'multimeter.webp',
    description: 'Auto-ranging, with test leads.', condition_grade: 'good', serial_number: 'DMM-77104',
    purchase_date: '2023-04-20', purchase_price: { amount: '35.00', currency: 'EUR' }, fields: { 'Power source': '9 V battery' }
  },
  {
    key: 'cordless-drill', name: 'Cordless drill', category: 'Tools', parent: 'tool-cabinet', addedDaysAgo: 44, photo: 'cordless-drill.webp',
    description: 'Drill driver with two batteries and a charger.', condition_grade: 'good',
    condition_notes: 'Second battery holds about half its charge.', serial_number: 'CD18-449201',
    purchase_date: '2022-07-09', purchase_price: { amount: '119.00', currency: 'EUR' },
    fields: { 'Power source': 'Battery', Voltage: 18 }
  },
  {
    key: 'screwdriver-set', name: 'Precision screwdriver set', category: 'Tools', parent: 'tool-cabinet', addedDaysAgo: 6,
    description: '24 bits for electronics and glasses.', is_new: true, condition_grade: 'excellent',
    purchase_date: '2026-09-25', purchase_price: { amount: '18.50', currency: 'EUR' }, fields: { 'Power source': 'Manual' }
  },
  {
    key: 'handheld-radio', name: 'Handheld radio', category: 'Travel & Outdoor', parent: 'camping-box', addedDaysAgo: 28,
    photo: 'handheld-radio.webp', description: 'Two-way radio for hiking trips.', condition_grade: 'good',
    serial_number: 'HR-5520183', fields: { 'Weight (g)': 230, Waterproof: true }
  },
  {
    key: 'flashlight', name: 'Compact flashlight', category: 'Travel & Outdoor', parent: 'camping-box', addedDaysAgo: 27,
    description: 'Rechargeable LED flashlight.', condition_grade: 'fair', condition_notes: 'Clip is bent.',
    fields: { 'Weight (g)': 95, Waterproof: true }
  },
  {
    key: 'first-aid', name: 'First-aid pouch', category: 'Travel & Outdoor', parent: 'camping-box', addedDaysAgo: 26,
    description: 'Basic kit for day trips.', condition_grade: 'poor', condition_notes: 'Plasters and wipes need restocking.',
    fields: { 'Weight (g)': 180, Waterproof: false }
  },
  {
    key: 'negatives', name: 'Photo negatives 2004–2010', category: 'Archive', parent: 'archive-box', addedDaysAgo: 50,
    description: 'Sleeved negatives, sorted by year.', fields: { 'Years covered': '2004–2010', Digitized: false }
  },
  {
    key: 'magazine-box', name: 'Magazine box', category: 'Archive', parent: 'archive-box', addedDaysAgo: 49,
    description: 'Photography magazines.', condition_grade: 'fair', fields: { 'Years covered': '1998–2003', Digitized: false }
  },
  {
    key: 'document-folder', name: 'Document folder', category: 'Archive', parent: 'archive-box', addedDaysAgo: 48,
    description: 'Manuals and receipts for the items in this inventory.', fields: { Digitized: true }
  }
];

export const templates = [
  {
    name: '35mm film roll', category: 'Photography', item_name: 'Film roll', is_new: true,
    description: 'ISO 400 color negative film.', fields: { Format: '35mm film' }
  }
];

/*
  Checklists name their items by key. `run` completes one run when the demo starts: `missing` lists
  the items marked Missing, every other item is confirmed.
*/
export const checklists = [
  {
    name: 'Weekend photo walk', mode: 'packing', description: 'Everything the film camera kit needs for a day out.',
    items: ['nikon-f65', 'nikkor-50mm', 'film-rolls', 'speedlight', 'power-bank']
  },
  {
    name: 'Workshop check', mode: 'verification', description: 'Monthly check that the tools are where they belong.',
    items: ['multimeter', 'cordless-drill', 'screwdriver-set'], run: { missing: ['screwdriver-set'] }
  }
];

// The generated photo of every item that has one, in the order of `items`.
export const photoFiles = items.filter(item => item.photo).map(item => item.photo);
