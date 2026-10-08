import { DEFAULT_LOCALE, resolveLocale } from '../i18n/core.js';

/*
  The canonical inventory of the public demo. Every name, value, serial number, and photo is invented
  for the showcase; the photos in ./photos/ are generated images made for this project. The seed in
  ./seed.js loads it through the real services, so it always passes the current validation rules.

  There is one inventory for every language. Each entity has a stable semantic `key` (`camera-bag`,
  `photography`, `mount`, …), and relations, dates, prices, serial numbers, photos, and numbers are
  written once. Only the invented display text is localized: a text is either one string for every
  language (a product name such as Nikon F65, a unit, a standard) or an object with one string per
  supported locale. `createDemoFixture(locale)` resolves that text for one language and fails on a
  missing translation, so a new locale cannot ship a half-translated demo.

  Items get the fixed UUID `demoUuid(index)` in the order below, so links, tests, and the guided tour
  can rely on them. `addedDaysAgo` dates each item relative to the visit, which keeps the Dashboard's
  30-day window populated whenever the demo is opened.
*/

// A valid version 4 UUID that only differs in its last group: d3e00000-0000-4000-8000-000000000001, ...
export const demoUuid = index => `d3e00000-0000-4000-8000-${String(index).padStart(12, '0')}`;

const databaseName = { en: 'Inventory Atlas Demo', uk: 'Демо Inventory Atlas' };

const locations = {
  'home-office': { en: 'Home / Office', uk: 'Дім / Кабінет' },
  'home-storage': { en: 'Home / Storage', uk: 'Дім / Комора' },
  workshop: { en: 'Workshop', uk: 'Майстерня' },
  'travel-gear': { en: 'Travel gear', uk: 'Туристичне спорядження' }
};

const categories = [
  {
    key: 'storage', name: { en: 'Storage', uk: 'Зберігання' }, fields: [
      { key: 'material', type: 'text', name: { en: 'Material', uk: 'Матеріал' } },
      { key: 'labeled', type: 'boolean', name: { en: 'Labeled', uk: 'Підписано' } }
    ]
  },
  {
    key: 'photography', name: { en: 'Photography', uk: 'Фототехніка' }, fields: [
      { key: 'mount', type: 'text', name: { en: 'Mount', uk: 'Байонет' } },
      { key: 'format', type: 'text', name: { en: 'Format', uk: 'Формат' } },
      { key: 'last-tested', type: 'date', name: { en: 'Last tested', uk: 'Остання перевірка' } }
    ]
  },
  {
    key: 'electronics', name: { en: 'Electronics', uk: 'Електроніка' }, fields: [
      { key: 'capacity', type: 'text', name: { en: 'Capacity', uk: 'Ємність' } },
      { key: 'connector', type: 'text', name: { en: 'Connector', uk: 'Роз’єм' } },
      { key: 'warranty-until', type: 'date', name: { en: 'Warranty until', uk: 'Гарантія до' } }
    ]
  },
  {
    key: 'tools', name: { en: 'Tools', uk: 'Інструменти' }, fields: [
      { key: 'power-source', type: 'text', name: { en: 'Power source', uk: 'Живлення' } },
      { key: 'voltage', type: 'number', name: { en: 'Voltage', uk: 'Напруга' } }
    ]
  },
  {
    key: 'travel-outdoor', name: { en: 'Travel & Outdoor', uk: 'Подорожі й туризм' }, fields: [
      { key: 'weight', type: 'number', name: { en: 'Weight (g)', uk: 'Вага (г)' } },
      { key: 'waterproof', type: 'boolean', name: { en: 'Waterproof', uk: 'Водонепроникний' } }
    ]
  },
  {
    key: 'archive', name: { en: 'Archive', uk: 'Архів' }, fields: [
      { key: 'years-covered', type: 'text', name: { en: 'Years covered', uk: 'Роки' } },
      { key: 'digitized', type: 'boolean', name: { en: 'Digitized', uk: 'Оцифровано' } }
    ]
  }
];

// Text values that more than one entity uses.
const filmFormat = { en: '35mm film', uk: 'Плівка 35 мм' };
const filmDescription = { en: 'ISO 400 color negative film.', uk: 'Кольорова негативна плівка ISO 400.' };
const secondBattery = { en: 'Second battery holds about half its charge.', uk: 'Другий акумулятор тримає приблизно половину заряду.' };

/*
  Containers come first, so every `parent` names an item that already exists. Only a top-level item
  has a `location` (a key of `locations`); the items inside a container inherit the container's.
  `fields` are keyed by field key. `previously` gives the item a short activity history: it is added
  with that `location` or `parent` and moved to its own one `daysAgo` days ago through the regular
  services, so its History (and that of everything inside it) shows a real recorded move.
*/
const items = [
  {
    key: 'camera-bag', name: { en: 'Camera Bag', uk: 'Сумка для камери' }, category: 'storage', location: 'home-office', addedDaysAgo: 58,
    description: { en: 'Padded shoulder bag that holds the film kit.', uk: 'М’яка сумка через плече для плівкового комплекту.' },
    condition_grade: 'good', fields: { material: { en: 'Waxed canvas', uk: 'Вощене полотно' }, labeled: true }
  },
  {
    key: 'electronics-drawer', name: { en: 'Electronics Drawer', uk: 'Шухляда з електронікою' }, category: 'storage', location: 'home-office',
    addedDaysAgo: 57, description: { en: 'Top drawer of the office desk.', uk: 'Верхня шухляда робочого столу.' },
    fields: { material: { en: 'Wood', uk: 'Дерево' }, labeled: true }
  },
  {
    key: 'tool-cabinet', name: { en: 'Tool Cabinet', uk: 'Шафа для інструментів' }, category: 'storage', location: 'workshop', addedDaysAgo: 56,
    description: { en: 'Wall-mounted cabinet with two shelves.', uk: 'Настінна шафа з двома полицями.' }, condition_grade: 'fair',
    condition_notes: { en: 'Lower hinge squeaks.', uk: 'Нижня петля скрипить.' }, fields: { material: { en: 'Steel', uk: 'Сталь' }, labeled: false }
  },
  {
    key: 'camping-box', name: { en: 'Camping Box', uk: 'Туристичний ящик' }, category: 'storage', location: 'travel-gear', addedDaysAgo: 55,
    previously: { location: 'home-storage', daysAgo: 21 },
    description: { en: 'Stackable box packed for weekend trips.', uk: 'Ящик, що ставиться в стос, зібраний для поїздок на вихідні.' },
    fields: { material: { en: 'Plastic', uk: 'Пластик' }, labeled: true }
  },
  {
    key: 'archive-box', name: { en: 'Archive Box', uk: 'Архівна коробка' }, category: 'storage', location: 'home-storage', addedDaysAgo: 54,
    description: { en: 'Acid-free box on the storage room shelf.', uk: 'Безкислотна коробка на полиці в коморі.' },
    fields: { material: { en: 'Cardboard', uk: 'Картон' }, labeled: true }
  },
  {
    key: 'nikon-f65', name: 'Nikon F65', category: 'photography', parent: 'camera-bag', addedDaysAgo: 40, photo: 'nikon-f65.webp',
    description: { en: '35mm film SLR body.', uk: 'Корпус плівкової дзеркальної камери 35 мм.' }, condition_grade: 'good',
    condition_notes: { en: 'Light wear on the grip; shutter tested.', uk: 'Легкі потертості на рукояті; затвор перевірено.' },
    serial_number: 'F65-2481937', purchase_date: '2021-05-14', purchase_price: { amount: '120.00', currency: 'EUR' },
    fields: { mount: 'Nikon F', format: filmFormat, 'last-tested': '2026-08-23' }
  },
  {
    key: 'nikkor-50mm', name: { en: 'Nikkor 50mm f/1.8 lens', uk: 'Об’єктив Nikkor 50mm f/1.8' }, category: 'photography', parent: 'camera-bag',
    addedDaysAgo: 39, photo: 'nikkor-50mm.webp', condition_grade: 'excellent',
    description: { en: 'Standard prime lens with front and rear caps.', uk: 'Стандартний фікс-об’єктив із передньою та задньою кришками.' },
    serial_number: 'NK50-3318420', purchase_date: '2021-06-02', purchase_price: { amount: '85.00', currency: 'EUR' },
    fields: { mount: 'Nikon F' }
  },
  {
    key: 'speedlight', name: { en: 'Speedlight flash', uk: 'Спалах Speedlight' }, category: 'photography', parent: 'camera-bag', addedDaysAgo: 24,
    previously: { parent: 'electronics-drawer', daysAgo: 15 }, photo: 'speedlight.webp', description: { en: 'Hot-shoe flash with a tilting head.', uk: 'Накамерний спалах із поворотною головкою.' },
    condition_grade: 'fair', condition_notes: { en: 'Battery door latch is loose.', uk: 'Засувка батарейного відсіку розхиталася.' },
    purchase_date: '2022-02-11', purchase_price: { amount: '45.00', currency: 'EUR' }, fields: { mount: 'Nikon F' }
  },
  {
    key: 'film-rolls', name: { en: 'Film rolls (5 pack)', uk: 'Фотоплівка (5 шт.)' }, category: 'photography', parent: 'camera-bag',
    addedDaysAgo: 3, photo: 'film-rolls.webp', description: filmDescription, is_new: true, purchase_date: '2026-09-28',
    purchase_price: { amount: '42.50', currency: 'EUR' }, fields: { format: filmFormat }
  },
  {
    key: 'power-bank', name: { en: 'Power bank 20,000 mAh', uk: 'Павербанк 20 000 mAh' }, category: 'electronics', parent: 'electronics-drawer',
    addedDaysAgo: 12, photo: 'power-bank.webp', is_new: true, condition_grade: 'excellent',
    description: { en: 'Charges a phone about four times.', uk: 'Заряджає телефон приблизно чотири рази.' },
    purchase_date: '2026-09-15', purchase_price: { amount: '39.90', currency: 'EUR' },
    fields: { capacity: { en: '20,000 mAh', uk: '20 000 mAh' }, connector: 'USB-C', 'warranty-until': '2028-09-15' }
  },
  {
    key: 'usb-c-charger', name: { en: 'USB-C charger 65 W', uk: 'Зарядний пристрій USB-C 65 W' }, category: 'electronics',
    parent: 'electronics-drawer', addedDaysAgo: 20, photo: 'usb-c-charger.webp', condition_grade: 'good',
    description: { en: 'Two-port wall charger.', uk: 'Мережевий зарядний пристрій на два порти.' },
    purchase_date: '2025-11-03', purchase_price: { amount: '29.00', currency: 'EUR' }, fields: { connector: 'USB-C' }
  },
  {
    key: 'portable-ssd', name: { en: 'Portable SSD 1 TB', uk: 'Портативний SSD 1 TB' }, category: 'electronics', parent: 'electronics-drawer',
    addedDaysAgo: 33, photo: 'portable-ssd.webp', condition_grade: 'good',
    description: { en: 'Photo scans and the offline backup copy.', uk: 'Скани фотографій і офлайн-копія резервних даних.' },
    serial_number: 'PSSD-1T-58210', purchase_date: '2025-03-01', purchase_price: { amount: '89.00', currency: 'EUR' },
    fields: { capacity: '1 TB', connector: 'USB-C', 'warranty-until': '2028-03-01' }
  },
  {
    key: 'hdmi-adapter', name: { en: 'HDMI/USB adapter', uk: 'Адаптер HDMI/USB' }, category: 'electronics', addedDaysAgo: 8,
    description: { en: 'Not put away yet after the last presentation.', uk: 'Ще не прибраний після останньої презентації.' },
    condition_grade: 'fair', fields: { connector: 'USB-C' }
  },
  {
    key: 'multimeter', name: { en: 'Digital multimeter', uk: 'Цифровий мультиметр' }, category: 'tools', parent: 'tool-cabinet', addedDaysAgo: 45,
    photo: 'multimeter.webp', description: { en: 'Auto-ranging, with test leads.', uk: 'З автовибором діапазону та щупами.' },
    condition_grade: 'good', serial_number: 'DMM-77104', purchase_date: '2023-04-20', purchase_price: { amount: '35.00', currency: 'EUR' },
    fields: { 'power-source': { en: '9 V battery', uk: 'Батарейка 9 V' } }
  },
  {
    key: 'cordless-drill', name: { en: 'Cordless drill', uk: 'Акумуляторний дриль' }, category: 'tools', parent: 'tool-cabinet', addedDaysAgo: 44,
    photo: 'cordless-drill.webp', condition_grade: 'good', condition_notes: secondBattery,
    description: { en: 'Drill driver with two batteries and a charger.', uk: 'Дриль-шуруповерт із двома акумуляторами та зарядним пристроєм.' },
    serial_number: 'CD18-449201', purchase_date: '2022-07-09', purchase_price: { amount: '119.00', currency: 'EUR' },
    fields: { 'power-source': { en: 'Battery', uk: 'Акумулятор' }, voltage: 18 }
  },
  {
    key: 'screwdriver-set', name: { en: 'Precision screwdriver set', uk: 'Набір прецизійних викруток' }, category: 'tools',
    parent: 'tool-cabinet', addedDaysAgo: 6, is_new: true, condition_grade: 'excellent',
    description: { en: '24 bits for electronics and glasses.', uk: '24 біти для електроніки та окулярів.' },
    purchase_date: '2026-09-25', purchase_price: { amount: '18.50', currency: 'EUR' },
    fields: { 'power-source': { en: 'Manual', uk: 'Ручний' } }
  },
  {
    key: 'handheld-radio', name: { en: 'Handheld radio', uk: 'Портативна рація' }, category: 'travel-outdoor', parent: 'camping-box',
    addedDaysAgo: 28, photo: 'handheld-radio.webp', condition_grade: 'good',
    description: { en: 'Two-way radio for hiking trips.', uk: 'Рація для походів.' },
    serial_number: 'HR-5520183', fields: { weight: 230, waterproof: true }
  },
  {
    key: 'flashlight', name: { en: 'Compact flashlight', uk: 'Компактний ліхтарик' }, category: 'travel-outdoor', parent: 'camping-box',
    addedDaysAgo: 27, description: { en: 'Rechargeable LED flashlight.', uk: 'Світлодіодний ліхтарик з акумулятором.' }, condition_grade: 'fair',
    condition_notes: { en: 'Clip is bent.', uk: 'Кліпса погнута.' }, fields: { weight: 95, waterproof: true }
  },
  {
    key: 'first-aid', name: { en: 'First-aid pouch', uk: 'Аптечка' }, category: 'travel-outdoor', parent: 'camping-box', addedDaysAgo: 26,
    description: { en: 'Basic kit for day trips.', uk: 'Базовий набір для одноденних виходів.' }, condition_grade: 'poor',
    condition_notes: { en: 'Plasters and wipes need restocking.', uk: 'Треба поповнити пластирі та серветки.' },
    fields: { weight: 180, waterproof: false }
  },
  {
    key: 'negatives', name: { en: 'Photo negatives 2004–2010', uk: 'Фотонегативи 2004–2010' }, category: 'archive', parent: 'archive-box',
    addedDaysAgo: 50, description: { en: 'Sleeved negatives, sorted by year.', uk: 'Негативи в конвертах, розкладені за роками.' },
    fields: { 'years-covered': '2004–2010', digitized: false }
  },
  {
    key: 'magazine-box', name: { en: 'Magazine box', uk: 'Коробка з журналами' }, category: 'archive', parent: 'archive-box', addedDaysAgo: 49,
    description: { en: 'Photography magazines.', uk: 'Журнали про фотографію.' }, condition_grade: 'fair',
    fields: { 'years-covered': '1998–2003', digitized: false }
  },
  {
    key: 'document-folder', name: { en: 'Document folder', uk: 'Папка з документами' }, category: 'archive', parent: 'archive-box',
    addedDaysAgo: 48, description: { en: 'Manuals and receipts for the items in this inventory.', uk: 'Інструкції та чеки до предметів цього інвентарю.' },
    fields: { digitized: true }
  }
];

const templates = [
  {
    key: 'film-roll', name: { en: '35mm film roll', uk: 'Фотоплівка 35 мм' }, category: 'photography',
    item_name: { en: 'Film roll', uk: 'Фотоплівка' }, is_new: true, description: filmDescription, fields: { format: filmFormat }
  }
];

/*
  Checklists name their items by key. `run` completes one run when the demo starts: `missing` lists
  the items marked Missing, every other item is confirmed.
*/
const checklists = [
  {
    key: 'weekend-photo-walk', name: { en: 'Weekend photo walk', uk: 'Фотопрогулянка на вихідних' }, mode: 'packing',
    description: { en: 'Everything the film camera kit needs for a day out.', uk: 'Усе, що потрібно плівковому комплекту на день зйомки.' },
    items: ['nikon-f65', 'nikkor-50mm', 'film-rolls', 'speedlight', 'power-bank']
  },
  {
    key: 'workshop-check', name: { en: 'Workshop check', uk: 'Перевірка майстерні' }, mode: 'verification',
    description: { en: 'Monthly check that the tools are where they belong.', uk: 'Щомісячна перевірка, що інструменти на своїх місцях.' },
    items: ['multimeter', 'cordless-drill', 'screwdriver-set'], run: { missing: ['screwdriver-set'] }
  }
];

// Temporary loans, lent and returned through the transfer service, so a History shows a closed loan.
const loans = [
  { item: 'cordless-drill', recipient: { en: 'Volodia', uk: 'Володя' }, daysAgo: 10, expectedReturnDaysAgo: 3, returnedDaysAgo: 4 }
];

/*
  The item the guided tour adds (./tourChapters.js): a second body for the film kit in the Camera Bag,
  shown with the seeded camera's generated photo. It is not part of the seeded inventory; its serial
  number is unique, so the tour finds it again in any language.
*/
const tourItem = {
  name: { en: 'Nikon F65 (spare body)', uk: 'Nikon F65 (запасний корпус)' },
  category: 'photography',
  container: 'camera-bag',
  condition: 'good',
  serialNumber: 'F65-3307512',
  fields: { mount: 'Nikon F', format: filmFormat },
  photo: 'nikon-f65.webp'
};

// The generated photo of every item that has one, in the order of `items`.
export const photoFiles = items.filter(item => item.photo).map(item => item.photo);

// The fixed UUID of a seeded item, by its key.
export function demoItemUuid(key) {
  const index = items.findIndex(item => item.key === key);
  if (index < 0) throw new Error(`The demo fixture has no item "${key}".`);
  return demoUuid(index + 1);
}

const TEXT_ATTRIBUTES = ['name', 'description', 'condition_notes', 'item_name'];

/*
  The demo inventory in one language. Keys, relations, and every non-text value are the same for
  each locale; `byKey(list, key)` finds an entity of the result. An unsupported locale gets English.
*/
export function createDemoFixture(requested = DEFAULT_LOCALE) {
  const locale = resolveLocale(requested);
  const text = (value, where) => {
    if (value === null || typeof value !== 'object') return value;
    if (typeof value[locale] !== 'string') throw new Error(`The demo fixture has no ${locale} text for ${where}.`);
    return value[locale];
  };
  // Field values that are objects are localized text; numbers, booleans, and dates are kept as they are.
  const values = (fields = {}, where) => Object.fromEntries(Object.entries(fields)
    .map(([key, value]) => [key, text(value, `${where} ${key}`)]));
  const texts = (entity, where) => Object.fromEntries(Object.entries(entity).map(([name, value]) =>
    [name, TEXT_ATTRIBUTES.includes(name) ? text(value, `${where} ${name}`) : value]));

  return {
    locale,
    databaseName: text(databaseName, 'the database name'),
    locations: Object.fromEntries(Object.entries(locations).map(([key, value]) => [key, text(value, `location ${key}`)])),
    categories: categories.map(category => ({
      key: category.key,
      name: text(category.name, `category ${category.key}`),
      fields: category.fields.map(field => ({ ...field, name: text(field.name, `field ${field.key}`) }))
    })),
    items: items.map(item => ({
      ...texts(item, `item ${item.key}`),
      ...(item.location && { location: text(locations[item.location], `location ${item.location}`) }),
      ...(item.previously?.location && {
        previously: { ...item.previously, location: text(locations[item.previously.location], `location ${item.previously.location}`) }
      }),
      fields: values(item.fields, `item ${item.key}`)
    })),
    loans: loans.map(loan => ({ ...loan, recipient: text(loan.recipient, `the loan of ${loan.item}`) })),
    templates: templates.map(template => ({ ...texts(template, `template ${template.key}`), fields: values(template.fields, `template ${template.key}`) })),
    checklists: checklists.map(checklist => texts(checklist, `checklist ${checklist.key}`)),
    tourItem: { ...tourItem, name: text(tourItem.name, 'the tour item'), fields: values(tourItem.fields, 'the tour item') }
  };
}

export function byKey(list, key) {
  const entity = list.find(entry => entry.key === key);
  if (!entity) throw new Error(`The demo fixture has no "${key}".`);
  return entity;
}
