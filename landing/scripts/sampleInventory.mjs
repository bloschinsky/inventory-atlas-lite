/*
  The fictional household inventory shown in the landing screenshots. Every name, value, and photo
  here is invented for the showcase: the photos are flat illustrations drawn below as SVG and
  rasterized locally, so no real or private inventory can ever reach the public page.
*/

// One flat illustration per photo key, drawn on a 800×800 canvas above a soft floor shadow.
const drawings = {
  camera: `
    <rect x="180" y="300" width="440" height="270" rx="34" fill="#2f3542"/>
    <rect x="250" y="250" width="150" height="70" rx="16" fill="#3d4453"/>
    <rect x="200" y="330" width="400" height="44" fill="#a4774f"/>
    <circle cx="400" cy="450" r="104" fill="#1e222b"/>
    <circle cx="400" cy="450" r="74" fill="#3b4d6b"/>
    <circle cx="400" cy="450" r="40" fill="#18324f"/>
    <circle cx="380" cy="430" r="13" fill="#9fc3ee" opacity=".8"/>
    <rect x="520" y="265" width="56" height="30" rx="8" fill="#c9ced8"/>`,
  drill: `
    <path d="M230 270h300a40 40 0 0 1 40 40v40a40 40 0 0 1-40 40H420l-40 150h-100l30-150h-80a40 40 0 0 1-40-40v-40a40 40 0 0 1 40-40Z" fill="#f08c00"/>
    <rect x="570" y="300" width="70" height="60" rx="10" fill="#495057"/>
    <rect x="636" y="318" width="70" height="24" rx="6" fill="#adb5bd"/>
    <rect x="250" y="540" width="170" height="80" rx="16" fill="#343a40"/>
    <rect x="300" y="350" width="40" height="70" rx="10" fill="#343a40"/>`,
  lantern: `
    <path d="M330 230a70 70 0 0 1 140 0" fill="none" stroke="#495057" stroke-width="18"/>
    <rect x="300" y="250" width="200" height="50" rx="18" fill="#2b8a3e"/>
    <rect x="320" y="300" width="160" height="230" rx="20" fill="#fff3bf"/>
    <circle cx="400" cy="415" r="60" fill="#ffd43b" opacity=".9"/>
    <rect x="300" y="520" width="200" height="70" rx="18" fill="#2b8a3e"/>
    <rect x="320" y="300" width="16" height="230" fill="#2b8a3e" opacity=".5"/>
    <rect x="464" y="300" width="16" height="230" fill="#2b8a3e" opacity=".5"/>`,
  headphones: `
    <path d="M230 470V400a170 170 0 0 1 340 0v70" fill="none" stroke="#343a40" stroke-width="34" stroke-linecap="round"/>
    <rect x="190" y="420" width="110" height="170" rx="46" fill="#5c7cfa"/>
    <rect x="500" y="420" width="110" height="170" rx="46" fill="#5c7cfa"/>
    <rect x="225" y="445" width="40" height="120" rx="20" fill="#364fc7"/>
    <rect x="535" y="445" width="40" height="120" rx="20" fill="#364fc7"/>`,
  toolbox: `
    <rect x="170" y="340" width="460" height="250" rx="22" fill="#1c7ed6"/>
    <rect x="170" y="340" width="460" height="70" rx="22" fill="#1971c2"/>
    <path d="M320 340v-60a20 20 0 0 1 20-20h120a20 20 0 0 1 20 20v60" fill="none" stroke="#343a40" stroke-width="22"/>
    <rect x="370" y="395" width="60" height="34" rx="6" fill="#dee2e6"/>`,
  backpack: `
    <path d="M280 300a120 120 0 0 1 240 0v260a40 40 0 0 1-40 40H320a40 40 0 0 1-40-40Z" fill="#c2255c"/>
    <path d="M350 250a50 50 0 0 1 100 0" fill="none" stroke="#862e9c" stroke-width="20"/>
    <rect x="320" y="420" width="160" height="130" rx="24" fill="#a61e4d"/>
    <rect x="340" y="440" width="120" height="14" rx="7" fill="#f783ac"/>`,
  tent: `
    <path d="M150 590 400 230l250 360Z" fill="#37b24d"/>
    <path d="M400 230 330 590h140Z" fill="#2b8a3e"/>
    <path d="M400 380 350 590h100Z" fill="#1b4332"/>
    <path d="M400 230v-30" stroke="#495057" stroke-width="10"/>`,
  crate: `
    <rect x="180" y="330" width="440" height="260" rx="16" fill="#868e96"/>
    <rect x="160" y="310" width="480" height="50" rx="12" fill="#495057"/>
    <g fill="#5c636a"><rect x="220" y="390" width="70" height="26" rx="10"/><rect x="330" y="390" width="140" height="26" rx="10"/><rect x="510" y="390" width="70" height="26" rx="10"/>
    <rect x="220" y="460" width="360" height="20" rx="10"/><rect x="220" y="520" width="360" height="20" rx="10"/></g>`,
  router: `
    <path d="M300 380 260 230M500 380l40-150" stroke="#495057" stroke-width="16" stroke-linecap="round"/>
    <rect x="170" y="380" width="460" height="150" rx="30" fill="#f1f3f5" stroke="#ced4da" stroke-width="6"/>
    <g fill="#40c057"><circle cx="250" cy="455" r="12"/><circle cx="295" cy="455" r="12"/><circle cx="340" cy="455" r="12"/></g>
    <circle cx="385" cy="455" r="12" fill="#fab005"/>
    <rect x="460" y="440" width="120" height="30" rx="8" fill="#ced4da"/>`,
  sleepingBag: `
    <rect x="190" y="300" width="420" height="270" rx="135" fill="#e8590c"/>
    <rect x="250" y="300" width="300" height="270" rx="10" fill="#d9480f" opacity=".5"/>
    <path d="M250 330v210M330 310v250M410 305v260M490 310v250" stroke="#fd7e14" stroke-width="10"/>`
};

const backgrounds = [['#e7f5ff', '#d0ebff'], ['#fff4e6', '#ffe8cc'], ['#ebfbee', '#d3f9d8'], ['#f3f0ff', '#e5dbff'], ['#fff0f6', '#ffdeeb']];

// A square SVG of one illustration; `index` only varies the background so neighbours differ.
export function photoSvg(kind, index = 0) {
  const [from, to] = backgrounds[index % backgrounds.length];
  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="800" viewBox="0 0 800 800">
    <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>
    <rect width="800" height="800" fill="url(#bg)"/>
    <ellipse cx="400" cy="620" rx="270" ry="34" fill="#000" opacity=".08"/>
    ${drawings[kind]}
  </svg>`;
}

export const categories = [
  { name: 'Electronics', fields: [{ name: 'Brand', type: 'text' }, { name: 'Model', type: 'text' }, { name: 'Warranty until', type: 'date' }] },
  { name: 'Tools', fields: [{ name: 'Brand', type: 'text' }, { name: 'Power source', type: 'text' }, { name: 'Cordless', type: 'boolean' }] },
  { name: 'Camping gear', fields: [{ name: 'Weight, kg', type: 'number' }, { name: 'Season', type: 'text' }] },
  { name: 'Storage', fields: [{ name: 'Material', type: 'text' }, { name: 'Capacity, L', type: 'number' }] },
  { name: 'Photo gear', fields: [{ name: 'Brand', type: 'text' }, { name: 'Mount', type: 'text' }] }
];

/*
  Items in creation order. `key` lets later items name their container (`in`) and checklists name
  their items; `photos` lists illustration kinds; `fields` are keyed by field name.
*/
export const items = [
  { key: 'shelf', name: 'Garage shelf A', category: 'Storage', location: 'Garage', description: 'Steel shelving unit by the side door.', fields: { Material: 'Steel' }, condition_grade: 'good' },
  { key: 'toolbox', name: 'Blue toolbox', category: 'Storage', in: 'shelf', photos: ['toolbox'], fields: { Material: 'Plastic', 'Capacity, L': 22 }, condition_grade: 'good' },
  { key: 'crate', name: 'Camping crate', category: 'Storage', in: 'shelf', photos: ['crate'], description: 'Everything for a weekend trip, packed and ready.', fields: { Material: 'Polypropylene', 'Capacity, L': 64 }, condition_grade: 'excellent' },
  { key: 'drill', name: 'Cordless drill', category: 'Tools', in: 'toolbox', photos: ['drill'], serial_number: 'CD-20V-48213', purchase_date: '2024-03-16', purchase_price: { amount: '129.00', currency: 'EUR' }, fields: { Brand: 'Northline', 'Power source': '20V battery', Cordless: true }, condition_grade: 'good', condition_notes: 'Second battery holds about half its charge.' },
  { name: 'Bit set, 32 pcs', category: 'Tools', in: 'toolbox', fields: { Brand: 'Northline', Cordless: false }, condition_grade: 'excellent' },
  { name: 'Digital multimeter', category: 'Tools', in: 'toolbox', purchase_price: { amount: '34.90', currency: 'EUR' }, fields: { Brand: 'Volta', 'Power source': '9V battery', Cordless: true }, condition_grade: 'good' },
  { key: 'tent', name: 'Two-person tent', category: 'Camping gear', in: 'crate', photos: ['tent'], purchase_date: '2023-05-02', purchase_price: { amount: '189.00', currency: 'EUR' }, fields: { 'Weight, kg': 2.4, Season: '3-season' }, condition_grade: 'good' },
  { key: 'bag', name: 'Down sleeping bag', category: 'Camping gear', in: 'crate', photos: ['sleepingBag'], fields: { 'Weight, kg': 1.1, Season: '3-season' }, condition_grade: 'excellent', is_new: true },
  { key: 'lantern', name: 'LED camping lantern', category: 'Camping gear', in: 'crate', photos: ['lantern'], fields: { 'Weight, kg': 0.4, Season: 'All year' }, condition_grade: 'excellent', is_new: true },
  { key: 'backpack', name: 'Hiking backpack 45 L', category: 'Camping gear', location: 'Hall closet', photos: ['backpack'], fields: { 'Weight, kg': 1.6, Season: 'All year' }, condition_grade: 'fair', condition_notes: 'Hip belt buckle replaced.' },
  { name: 'Trekking poles', category: 'Camping gear', location: 'Hall closet', fields: { 'Weight, kg': 0.5, Season: 'All year' }, condition_grade: 'good' },
  { key: 'desk', name: 'Office desk drawer', category: 'Storage', location: 'Home office', fields: { Material: 'Oak' }, condition_grade: 'good' },
  { key: 'headphones', name: 'Noise-cancelling headphones', category: 'Electronics', in: 'desk', photos: ['headphones'], serial_number: 'HX-700-90311', purchase_date: '2025-11-28', purchase_price: { amount: '279.00', currency: 'EUR' }, fields: { Brand: 'Sonora', Model: 'HX700', 'Warranty until': '2027-11-28' }, condition_grade: 'excellent', is_new: true },
  { key: 'router', name: 'Wi-Fi router', category: 'Electronics', location: 'Home office', photos: ['router'], serial_number: 'AX3000-55120', purchase_date: '2024-08-09', purchase_price: { amount: '99.00', currency: 'EUR' }, fields: { Brand: 'Netwave', Model: 'AX3000', 'Warranty until': '2026-08-09' }, condition_grade: 'good' },
  { name: 'USB-C charger 65 W', category: 'Electronics', in: 'desk', fields: { Brand: 'Volta', Model: 'GaN 65' }, condition_grade: 'good' },
  { name: 'External SSD 2 TB', category: 'Electronics', in: 'desk', serial_number: 'SSD2T-77310', purchase_price: { amount: '149.00', currency: 'EUR' }, fields: { Brand: 'Corelink', Model: 'Portable X2' }, condition_grade: 'excellent' },
  { name: 'Old tablet', category: 'Electronics', location: 'Home office', transferred_to: 'Lent to Alex', fields: { Brand: 'Pagewise', Model: 'Tab 10' }, condition_grade: 'fair', condition_notes: 'Small scratch on the screen.' },
  { key: 'camera', name: 'Mirrorless camera', category: 'Photo gear', location: 'Home office', photos: ['camera'], serial_number: 'MC-24-30418', purchase_date: '2025-04-21', purchase_price: { amount: '899.00', currency: 'EUR' }, fields: { Brand: 'Lumora', Mount: 'L-mount' }, condition_grade: 'excellent' },
  { name: 'Prime lens 35 mm', category: 'Photo gear', location: 'Home office', fields: { Brand: 'Lumora', Mount: 'L-mount' }, condition_grade: 'good' },
  { name: 'Travel tripod', category: 'Photo gear', location: 'Hall closet', fields: { Brand: 'Stillpoint' }, condition_grade: 'poor', condition_notes: 'One leg lock is loose.' },
  { name: 'Basement shelf B', category: 'Storage', location: 'Basement', fields: { Material: 'Wood' }, condition_grade: 'fair' },
  { name: 'Extension cord 10 m', category: 'Tools', location: 'Basement', fields: { 'Power source': 'Mains', Cordless: false }, condition_grade: 'broken', condition_notes: 'Damaged plug, keep for parts.' }
];

export const checklists = [
  { name: 'Weekend camping trip', mode: 'packing', description: 'Pack the night before leaving.', items: ['tent', 'bag', 'lantern', 'backpack', 'camera', 'headphones'] },
  { name: 'Home office check', mode: 'verification', description: 'Quarterly check of the office equipment.', items: ['router', 'camera', 'headphones'] }
];
