import { MAX_AI_MODEL_LENGTH } from '../../../shared/aiProviders.js';

/*
  Turns OpenAI's /models listing into the grouped choices of the Settings model selector. The
  listing is the only source of availability: any GPT generation it returns is recognized by its
  name pattern, so a new release appears without an application update. /models carries no
  modalities, structured-output support, or prices, so nothing is inferred from a name: a model's
  capabilities are known only when this application has verified it, and are null otherwise.
*/

// Checked against AI Add Item (photo identification at original detail) and AI Add Fields, both
// with strict JSON-schema output through the Responses API.
const VERIFIED_MODELS = ['gpt-5.6-luna', 'gpt-5.6-terra', 'gpt-5.6-sol'];

// Families that cannot answer a text or vision request with JSON: embeddings, moderation, speech,
// realtime sessions, image and video generation, and the legacy completion models.
const EXCLUDED_TOKENS = new Set([
  'embedding', 'embeddings', 'moderation', 'tts', 'whisper', 'transcribe', 'audio', 'realtime',
  'image', 'dall', 'sora', 'davinci', 'babbage'
]);

const GPT_ID = /^gpt-(\d+)(?:\.(\d+))?([a-z]?)(?:-([a-z0-9][a-z0-9.-]*))?$/i;
// Dated or numbered snapshots (gpt-4-0613, gpt-5.6-luna-2026-08-01) pin an alias that is listed too.
const SNAPSHOT_TOKEN = /^\d{4}$/;

// The compact view: the newest generation, then a few variants of each older one.
const LATEST_LIMIT = 6;
const PREVIOUS_PER_GENERATION = 3;
const COMPACT_LIMIT = 9;

const validId = id => typeof id === 'string' && id.length <= MAX_AI_MODEL_LENGTH && /^[!-~]+$/.test(id);
const tokens = id => id.toLowerCase().split(/[-_.:/]/);
const titleCase = word => word.charAt(0).toUpperCase() + word.slice(1);

export const isExcludedModel = id => tokens(id).some(token => EXCLUDED_TOKENS.has(token));

// The GPT version of an ID, compared numerically: 6.10 is newer than 6.9, and 6 equals 6.0.
export function gptVersion(id) {
  const match = GPT_ID.exec(id);
  if (!match) return null;
  const variant = match[4] ? match[4].toLowerCase() : '';
  return {
    major: Number(match[1]),
    minor: match[2] === undefined ? 0 : Number(match[2]),
    name: `${match[1]}${match[2] === undefined ? '' : `.${match[2]}`}${match[3].toLowerCase()}`,
    variant,
    snapshot: variant.split('-').some(token => SNAPSHOT_TOKEN.test(token))
  };
}

// Newer first; a letter suffix (4o) follows its plain version (4).
export function compareGptVersions(a, b) {
  return b.major - a.major || b.minor - a.minor || b.name.localeCompare(a.name);
}

function modelLabel(id, version) {
  if (!version || version.snapshot) return id;
  const variant = version.variant ? ` ${version.variant.split('-').map(titleCase).join(' ')}` : '';
  return `GPT-${version.name}${variant}`;
}

const verifiedRank = id => {
  const index = VERIFIED_MODELS.indexOf(id);
  return index < 0 ? VERIFIED_MODELS.length : index;
};

// Version first, then verified models, then the provider's creation time, then the ID: stable ties.
function compareModels(a, b) {
  if (a.version && b.version) {
    const byVersion = compareGptVersions(a.version, b.version);
    if (byVersion) return byVersion;
  } else if (a.version || b.version) {
    return a.version ? -1 : 1;
  }
  return verifiedRank(a.id) - verifiedRank(b.id) || (b.created ?? 0) - (a.created ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/*
  `listed` is the `data` array of /models. Returns every usable candidate once, with its group:
  `recommended` (the newest GPT generation and the verified models), `previous` (a few variants of
  each older generation), or `other` (everything else, shown on request). IDs are kept exactly.
*/
export function classifyOpenAiModels(listed) {
  const candidates = new Map();
  for (const entry of listed) {
    const id = entry?.id;
    if (!validId(id) || candidates.has(id) || isExcludedModel(id)) continue;
    candidates.set(id, { id, version: gptVersion(id), created: Number.isInteger(entry.created) ? entry.created : null });
  }
  const sorted = [...candidates.values()].sort(compareModels);
  const aliases = sorted.filter(model => model.version && !model.version.snapshot);
  const newest = aliases[0]?.version.name;

  const groups = new Map();
  const perGeneration = new Map();
  let latest = 0;
  for (const model of aliases) {
    if (VERIFIED_MODELS.includes(model.id)) groups.set(model.id, 'recommended');
    else if (model.version.name === newest && latest < LATEST_LIMIT) { groups.set(model.id, 'recommended'); latest += 1; }
  }
  for (const model of aliases) {
    if (groups.has(model.id) || groups.size >= COMPACT_LIMIT || model.version.name === newest) continue;
    const shown = perGeneration.get(model.version.name) ?? 0;
    if (shown >= PREVIOUS_PER_GENERATION) continue;
    perGeneration.set(model.version.name, shown + 1);
    groups.set(model.id, 'previous');
  }

  const order = { recommended: 0, previous: 1, other: 2 };
  return sorted
    .map(({ id, version, created }) => {
      const verified = VERIFIED_MODELS.includes(id);
      return {
        id,
        label: modelLabel(id, version),
        group: groups.get(id) ?? 'other',
        verified,
        imageInput: verified ? true : null,
        structuredOutput: verified ? true : null,
        created
      };
    })
    .sort((a, b) => order[a.group] - order[b.group]);
}

// What is known about one model without asking the provider: verified models only.
export const knownOpenAiCapabilities = model => (VERIFIED_MODELS.includes(model)
  ? { imageInput: true, structuredOutput: true }
  : { imageInput: null, structuredOutput: null });
