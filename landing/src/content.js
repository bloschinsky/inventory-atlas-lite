/*
  The landing page copy. The page is English-only public product copy; the vue-i18n
  rules of AGENTS.md apply to the application in client/. Screenshots are real captures of the
  application made by landing/scripts/capture-screenshots.mjs from a fictional sample inventory.
*/
import {
  IconBrandDocker, IconCategory, IconChartPie, IconChecklist, IconCloudOff, IconDatabase, IconDeviceMobile, IconDownload,
  IconQrcode, IconServer, IconServer2, IconSitemap, IconTerminal2
} from '@tabler/icons-vue';
import checklistRunPhone from './assets/screenshots/checklist-run-phone.webp';
import dashboard from './assets/screenshots/dashboard.webp';
import hierarchy from './assets/screenshots/hierarchy.webp';
import itemDetails from './assets/screenshots/item-details.webp';
import itemPhone from './assets/screenshots/item-phone.webp';
import items from './assets/screenshots/items.webp';
import itemsSearch from './assets/screenshots/items-search.webp';
import labels from './assets/screenshots/labels.webp';
import { links } from '../site.js';

export const info = __LANDING_INFO__;

export const hero = {
  desktop: { src: items, alt: 'The Items list of Inventory Atlas Lite: item photos, categories, condition badges, locations, and the containers items are stored inside.' },
  phone: { src: itemPhone, alt: 'An item page on a phone, showing the item photo and the Edit, Duplicate, and QR Code actions.' }
};

export const principles = [
  { icon: IconServer, title: 'Runs on your server', text: 'A home server, a NAS, a Proxmox container, or Docker. There is no hosted service and no account.' },
  { icon: IconDatabase, title: 'Your data in one file', text: 'Items, fields, and original photos live in one SQLite database you can download and restore.' },
  { icon: IconDeviceMobile, title: 'Phone-friendly', text: 'Open it from any phone on your network or VPN to look things up, scan labels, and tick off checklists.' },
  { icon: IconCloudOff, title: 'No cloud required', text: 'Everyday use stays local. AI drafts and cloud backups are optional and off until you set them up.' }
];

export const sections = [
  {
    id: 'hierarchy',
    icon: IconSitemap,
    eyebrow: 'Organization',
    title: 'Everything has a place',
    text: 'Model your home the way it really is. Items sit in locations, inside containers, inside other containers — and the Hierarchy shows the whole picture.',
    points: [
      'Location → container → item, nested as deep as you need.',
      'Contained items show the location of their outermost container.',
      'Browse a searchable tree or an interactive graph, by location or by category.',
      'Move a whole selection into another container in one step.'
    ],
    media: [{ src: hierarchy, alt: 'The Hierarchy tree grouped by location: Basement and Garage, with Garage shelf A containing the Blue toolbox and the tools inside it.' }]
  },
  {
    id: 'items',
    icon: IconCategory,
    eyebrow: 'Items',
    title: 'Categories with fields that fit',
    text: 'Every category gets its own fields, so a drill can record its power source and a camera its lens mount, next to the details every item shares.',
    points: [
      'Text, number, date, and yes/no custom fields per category.',
      'Condition grades, New or Used, purchase date and price, serial numbers.',
      'Templates, Duplicate, and Batch Add from JSON for quick data entry.',
      'Choose and sort the columns of the Items list, including custom fields.'
    ],
    media: [{ src: itemDetails, alt: 'An item page for a cordless drill with its photo, condition, purchase details, serial number, the Tools category fields, and the container it is stored in.' }]
  },
  {
    id: 'photos-qr',
    icon: IconQrcode,
    eyebrow: 'Photos and QR',
    title: 'See it, label it, scan it',
    text: 'Keep photos with each item and print QR labels for boxes and shelves. Scan a label with your phone to open the item right away.',
    points: [
      'Several photos per item, in your order, with the cover photo you choose.',
      'QR labels on A4 sheets in three layouts, with the details you pick.',
      'The in-app scanner reads labels with the camera or from an image, locally.',
      'Optional local background removal for clean product photos.'
    ],
    media: [{ src: labels, alt: 'The Print Labels page with six QR labels on an A4 sheet and options for the layout and the details shown on each label.' }]
  },
  {
    id: 'find',
    icon: IconChecklist,
    eyebrow: 'Find and check',
    title: 'Find it fast, check it off',
    text: 'Search names, descriptions, serial numbers, and custom field values, then filter by category and condition. Checklists make packing and audits routine.',
    points: [
      'Instant search and filters across the whole inventory.',
      'Packing and Verification checklists with a phone-first run page.',
      'Audit a container to confirm everything inside is still there.',
      'Completed checks record when each item was last verified.'
    ],
    media: [
      { src: itemsSearch, alt: 'The Items list filtered by the search “camping”, showing the Camping crate and the LED camping lantern.' },
      { src: checklistRunPhone, alt: 'A packing checklist run on a phone: four of six items checked, with Packed, Missing, and Pending buttons for each item.', phone: true }
    ]
  },
  {
    id: 'dashboard',
    icon: IconChartPie,
    eyebrow: 'Insights',
    title: 'A dashboard for your stuff — and optional AI',
    text: 'See how big the inventory is, how well it is documented, and where things are. When you want help, AI can draft items and fields for you to review.',
    points: [
      'Totals, photo coverage, placement status, and recent additions.',
      'Breakdowns by category, condition, and location.',
      'AI Add Item drafts an item from a photo or a description — optional, off by default.',
      'Works with OpenAI, OpenRouter, or a local Ollama or LM Studio model.'
    ],
    media: [{ src: dashboard, alt: 'The Dashboard with total items, photo coverage, placement status, items added in the last 30 days, items by category, and the condition breakdown.' }]
  }
];

export const installOptions = [
  { icon: IconDownload, title: 'GitHub Release', text: 'Every stable version is published with release notes, a checksummed source archive, and a Docker image.', link: links.releases, label: 'Browse releases' },
  { icon: IconBrandDocker, title: 'Docker', text: 'Run the image from GitHub Container Registry with your data on a named volume.', link: links.docker, label: 'Docker instructions' },
  { icon: IconServer2, title: 'Proxmox VE', text: 'One command on a Proxmox node creates an unprivileged LXC and installs the latest release.', link: links.proxmox, label: 'Proxmox guide' },
  { icon: IconTerminal2, title: 'Node.js', text: 'Build and start it with Node.js on any machine you already run.', link: links.manual, label: 'Manual setup' }
];
