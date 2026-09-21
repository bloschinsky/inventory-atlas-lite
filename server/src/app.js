import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { closeDatabase, databasePath, dataDir, db, openDatabase } from './db.js';
import { CategoryRepository } from './repositories/categoryRepository.js';
import { CustomFieldRepository } from './repositories/customFieldRepository.js';
import { DashboardRepository } from './repositories/dashboardRepository.js';
import { ItemPhotoRepository } from './repositories/itemPhotoRepository.js';
import { ItemRepository } from './repositories/itemRepository.js';
import { RestoreStagingStore } from './restore/stagingStore.js';
import { maxUploadBytes, safetyBackupDir, stagingDir, tokenTtlMs } from './restore/restoreConfig.js';
import { removeBackground } from './integrations/backgroundRemoval.js';
import { OpenAiClient } from './integrations/openAiClient.js';
import { AiFieldService } from './services/aiFieldService.js';
import { AiItemAnalysisService } from './services/aiItemAnalysisService.js';
import { AiSettingsService } from './services/aiSettingsService.js';
import { BackupService } from './services/backupService.js';
import { CategoryService } from './services/categoryService.js';
import { CustomFieldService } from './services/customFieldService.js';
import { DashboardService } from './services/dashboardService.js';
import { ImageService } from './services/imageService.js';
import { ItemService } from './services/itemService.js';
import { PhotoService } from './services/photoService.js';
import { RestoreService } from './services/restoreService.js';
import { errorHandler, maintenanceGuard } from './http/errorHandler.js';
import { createImageUpload, createRestoreUpload } from './http/uploads.js';
import { createAiRoutes } from './routes/aiRoutes.js';
import { createBackupRoutes } from './routes/backupRoutes.js';
import { createCategoryRoutes } from './routes/categoryRoutes.js';
import { createDashboardRoutes } from './routes/dashboardRoutes.js';
import { createFieldRoutes } from './routes/fieldRoutes.js';
import { createImageRoutes } from './routes/imageRoutes.js';
import { createItemRoutes } from './routes/itemRoutes.js';
import { createPhotoRoutes } from './routes/photoRoutes.js';
import { createSystemRoutes } from './routes/systemRoutes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/*
  The composition root: every repository, service, and route table is created here and receives its
  dependencies explicitly. Nothing below this file reaches for a module-level singleton.
*/
export function createApp({ production = false } = {}) {
  const appVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version;

  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const itemRepository = new ItemRepository(db);
  const itemPhotoRepository = new ItemPhotoRepository(db);
  const dashboardRepository = new DashboardRepository(db);

  const staging = new RestoreStagingStore({ stagingDir, tokenTtlMs });
  // Leftover staged uploads from a previous run are never resumable, so they are cleared at startup.
  staging.reset();
  staging.startSweepTimer();
  const restoreService = new RestoreService({
    db,
    // The connection lifecycle of the active database, which a restore replaces as a whole.
    database: { path: databasePath, close: closeDatabase, open: openDatabase },
    staging,
    dataDir,
    safetyBackupDir
  });

  const openAiClient = new OpenAiClient();
  const aiSettingsService = new AiSettingsService({ settingsPath: path.join(dataDir, 'ai-settings.json'), openAiClient });
  const categoryService = new CategoryService(categoryRepository);
  const customFieldService = new CustomFieldService(customFieldRepository, categoryService);
  const itemService = new ItemService({ itemRepository, customFieldRepository, itemPhotoRepository, categoryRepository });
  const photoService = new PhotoService({ itemRepository, itemPhotoRepository });
  const dashboardService = new DashboardService({ dashboardRepository, categoryRepository });
  const imageService = new ImageService({ removeBackground });
  const aiItemAnalysisService = new AiItemAnalysisService({ aiSettingsService, openAiClient, categoryRepository, customFieldRepository });
  const aiFieldService = new AiFieldService({ aiSettingsService, openAiClient, categoryService, customFieldRepository });
  const backupService = new BackupService({ db, restoreService });

  const imageUpload = createImageUpload();
  const restoreUpload = createRestoreUpload({ staging, maxUploadBytes });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(maintenanceGuard(restoreService));

  app.use(createAiRoutes({ aiSettingsService, aiItemAnalysisService, imageUpload }));
  app.use(createImageRoutes({ imageService, imageUpload }));
  app.use(createCategoryRoutes({ categoryService }));
  app.use(createDashboardRoutes({ dashboardService }));
  app.use(createFieldRoutes({ customFieldService, aiFieldService }));
  app.use(createItemRoutes({ itemService }));
  app.use(createPhotoRoutes({ photoService, imageUpload }));
  app.use(createSystemRoutes({ restoreService, db, appVersion }));
  app.use(createBackupRoutes({ backupService, restoreService, restoreUpload }));

  if (production) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
  }
  app.use(errorHandler);

  return { app, staging, restoreService, appVersion };
}
