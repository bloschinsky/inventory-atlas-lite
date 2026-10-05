import initSqlJs from 'sql.js';
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url';
import { errorResponse } from '../../../server/src/http/errorHandler.js';
import { httpError } from '../../../server/src/httpError.js';
import { createCapabilityRoutes } from '../../../server/src/routes/capabilityRoutes.js';
import { createCategoryRoutes } from '../../../server/src/routes/categoryRoutes.js';
import { createChecklistRoutes } from '../../../server/src/routes/checklistRoutes.js';
import { createDashboardRoutes } from '../../../server/src/routes/dashboardRoutes.js';
import { createDatabaseMetadataRoutes } from '../../../server/src/routes/databaseMetadataRoutes.js';
import { createFieldRoutes } from '../../../server/src/routes/fieldRoutes.js';
import { createItemRoutes } from '../../../server/src/routes/itemRoutes.js';
import { createItemTemplateRoutes } from '../../../server/src/routes/itemTemplateRoutes.js';
import { createPhotoRoutes } from '../../../server/src/routes/photoRoutes.js';
import { createResponse, matchRoute } from './express.js';
import { photoFiles } from './fixture.js';
import { seedDemoInventory } from './seed.js';
import { createDemoServices } from './services.js';

/*
  The backend of the public demo, inside the browser: the real inventory route tables and services
  over an in-memory database seeded with the canonical fixture. Every reload starts from that fixture
  again, and so does `reset()`, which the guided tour calls in place; nothing ever leaves the page. Any other API path, such as backups, restore, reset, cloud
  backup, updates, or AI, answers DEMO_UNAVAILABLE.
*/

const photoUrls = import.meta.glob('./photos/*.webp', { query: '?url', import: 'default', eager: true });

// The same image types and limits as the upload middleware in server/src/http/uploads.js.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const uploadError = code => Object.assign(new Error(code), { name: 'MulterError', code });

const imageUpload = {
  array: (field, maxCount) => async req => {
    const files = req.formData?.getAll(field) ?? [];
    if (files.length > maxCount) throw uploadError('LIMIT_FILE_COUNT');
    req.files = await Promise.all(files.map(async file => {
      if (!IMAGE_TYPES.has(file.type)) throw httpError(400, 'UNSUPPORTED_IMAGE_TYPE');
      if (file.size > MAX_PHOTO_BYTES) throw uploadError('LIMIT_FILE_SIZE');
      return { originalname: file.name, mimetype: file.type, size: file.size, buffer: new Uint8Array(await file.arrayBuffer()) };
    }));
  }
};

const unavailable = () => { throw httpError(501, 'DEMO_UNAVAILABLE'); };

// Express's default query parser: a repeated key becomes an array.
const readQuery = searchParams => {
  const query = {};
  for (const [key, value] of searchParams) {
    query[key] = key in query ? [query[key]].flat().concat(value) : value;
  }
  return query;
};

async function loadPhotos() {
  const entries = await Promise.all(photoFiles.map(async name => {
    const response = await fetch(photoUrls[`./photos/${name}`]);
    if (!response.ok) throw new Error(`The demo photo ${name} could not be loaded.`);
    return [name, new Uint8Array(await response.arrayBuffer())];
  }));
  return new Map(entries);
}

const createRouters = services => [
  // AI is never configured in the demo, so the client hides every AI entry point.
  createCapabilityRoutes({ aiSettingsService: { read: () => ({ enabled: false, imageInput: 'unsupported' }) } }),
  createCategoryRoutes(services),
  createDashboardRoutes(services),
  createDatabaseMetadataRoutes(services),
  createFieldRoutes({ ...services, aiFieldService: { generateForCategory: unavailable } }),
  createItemRoutes(services),
  createItemTemplateRoutes(services),
  createChecklistRoutes(services),
  createPhotoRoutes({ ...services, imageUpload })
];

export async function startDemoBackend() {
  const [SQL, photos] = await Promise.all([initSqlJs({ locateFile: () => wasmUrl }), loadPhotos()]);
  let services;
  let routers;
  // <img> elements cannot go through fetch(), so each stored photo gets one object URL.
  const objectUrls = new Map();

  // A new in-memory database seeded with the canonical fixture, the same state a reload starts from.
  function reset() {
    for (const url of objectUrls.values()) URL.revokeObjectURL(url);
    objectUrls.clear();
    services = createDemoServices(SQL);
    seedDemoInventory(services, photos);
    routers = createRouters(services);
  }
  reset();

  async function handle(url, options = {}) {
    const { pathname, searchParams } = new URL(url, window.location.href);
    const method = (options.method ?? 'GET').toUpperCase();
    const res = createResponse();
    try {
      const match = matchRoute(routers, method, pathname.slice(pathname.indexOf('/api/')));
      if (!match) unavailable();
      const req = { method, params: match.params, query: readQuery(searchParams) };
      if (options.body instanceof FormData) req.formData = options.body;
      else if (typeof options.body === 'string') req.body = JSON.parse(options.body);
      for (const handler of match.route.handlers) await handler(req, res, () => {});
    } catch (error) {
      const { status, body } = errorResponse(error);
      if (status === 500) console.error(error);
      res.status(status).json({ error: body });
    }
    return new Response(res.statusCode === 204 ? null : res.body, { status: res.statusCode, headers: res.headers });
  }

  function photoUrl(id) {
    if (!objectUrls.has(id)) {
      let photo;
      try {
        photo = services.photoService.get(id);
      } catch {
        return '';
      }
      objectUrls.set(id, URL.createObjectURL(new Blob([photo.data], { type: photo.mime_type })));
    }
    return objectUrls.get(id);
  }

  return { fetch: handle, photoUrl, reset };
}
