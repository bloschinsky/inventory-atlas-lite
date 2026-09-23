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
import { DatabaseMaintenance } from './restore/databaseMaintenance.js';
import { RestoreStagingStore } from './restore/stagingStore.js';
import { maxUploadBytes, resetBackupDir, resetTokenTtlMs, safetyBackupDir, stagingDir, tokenTtlMs } from './restore/restoreConfig.js';
import { releaseCacheTtlMs, releaseRepository, updatePathUnitFile, updateRequestFile, updateStaleAfterMs, updateStartTimeoutMs, updateStatusFile } from './update/updateConfig.js';
import { resolveDeployment } from './update/deployment.js';
import { UpdateStatusStore } from './update/updateStatusStore.js';
import { SystemdUpdateTrigger } from './update/updateTrigger.js';
import { removeBackground } from './integrations/backgroundRemoval.js';
import { GitHubReleaseClient } from './integrations/githubReleaseClient.js';
import { OpenAiCompatibleProvider } from './integrations/openAiCompatibleProvider.js';
import { OpenAiProvider } from './integrations/openAiProvider.js';
import { AiFieldService } from './services/aiFieldService.js';
import { AiItemAnalysisService } from './services/aiItemAnalysisService.js';
import { AiProviderService } from './services/aiProviderService.js';
import { AiSettingsService } from './services/aiSettingsService.js';
import { BackupService } from './services/backupService.js';
import { CategoryService } from './services/categoryService.js';
import { CustomFieldService } from './services/customFieldService.js';
import { DashboardService } from './services/dashboardService.js';
import { ImageService } from './services/imageService.js';
import { ItemService } from './services/itemService.js';
import { PhotoService } from './services/photoService.js';
import { ResetService } from './services/resetService.js';
import { RestoreService } from './services/restoreService.js';
import { UpdateService } from './services/updateService.js';
import { errorHandler, maintenanceGuard } from './http/errorHandler.js';
import { createImageUpload, createRestoreUpload } from './http/uploads.js';
import { createAiRoutes } from './routes/aiRoutes.js';
import { createBackupRoutes } from './routes/backupRoutes.js';
import { createCapabilityRoutes } from './routes/capabilityRoutes.js';
import { createCategoryRoutes } from './routes/categoryRoutes.js';
import { createDashboardRoutes } from './routes/dashboardRoutes.js';
import { createFieldRoutes } from './routes/fieldRoutes.js';
import { createImageRoutes } from './routes/imageRoutes.js';
import { createItemRoutes } from './routes/itemRoutes.js';
import { createPhotoRoutes } from './routes/photoRoutes.js';
import { createResetRoutes } from './routes/resetRoutes.js';
import { createSystemRoutes } from './routes/systemRoutes.js';
import { createUpdateRoutes } from './routes/updateRoutes.js';

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

  // Restore and reset both replace the active database, so they share one maintenance state.
  const maintenance = new DatabaseMaintenance({
    db,
    // The connection lifecycle of the active database, which a restore or reset replaces as a whole.
    database: { path: databasePath, close: closeDatabase, open: openDatabase },
    dataDir
  });
  const staging = new RestoreStagingStore({ stagingDir, tokenTtlMs });
  // Leftover staged uploads from a previous run are never resumable, so they are cleared at startup.
  staging.reset();
  staging.startSweepTimer();
  const restoreService = new RestoreService({ db, maintenance, staging, dataDir, safetyBackupDir });
  const resetService = new ResetService({ db, maintenance, dataDir, backupDir: resetBackupDir, tokenTtlMs: resetTokenTtlMs });

  const deployment = resolveDeployment();
  const updateService = new UpdateService({
    appVersion,
    deployment,
    releaseClient: new GitHubReleaseClient({
      owner: releaseRepository.owner,
      repository: releaseRepository.name,
      cacheTtlMs: releaseCacheTtlMs
    }),
    statusStore: new UpdateStatusStore({ file: updateStatusFile }),
    trigger: new SystemdUpdateTrigger({ requestFile: updateRequestFile, pathUnitFile: updatePathUnitFile }),
    startTimeoutMs: updateStartTimeoutMs,
    staleAfterMs: updateStaleAfterMs
  });

  const aiSettingsService = new AiSettingsService({ settingsPath: path.join(dataDir, 'ai-settings.json') });
  // OpenAI keeps its native adapter; every other preset speaks the generic OpenAI-compatible API.
  const aiProviderService = new AiProviderService({
    aiSettingsService,
    createProvider: connection => (connection.provider === 'openai' ? new OpenAiProvider(connection) : new OpenAiCompatibleProvider(connection))
  });
  const categoryService = new CategoryService(categoryRepository);
  const customFieldService = new CustomFieldService(customFieldRepository, categoryService);
  const itemService = new ItemService({ itemRepository, customFieldRepository, itemPhotoRepository, categoryRepository });
  const photoService = new PhotoService({ itemRepository, itemPhotoRepository });
  const dashboardService = new DashboardService({ dashboardRepository, categoryRepository });
  const imageService = new ImageService({ removeBackground });
  const aiItemAnalysisService = new AiItemAnalysisService({ aiProviderService, categoryRepository, customFieldRepository });
  const aiFieldService = new AiFieldService({ aiProviderService, categoryService, customFieldRepository });
  const backupService = new BackupService({ db, maintenance });

  const imageUpload = createImageUpload();
  const restoreUpload = createRestoreUpload({ staging, maxUploadBytes });

  const app = express();
  app.use(express.json({ limit: '1mb' }));
  app.use(maintenanceGuard(maintenance));

  app.use(createAiRoutes({ aiSettingsService, aiProviderService, aiItemAnalysisService, imageUpload }));
  app.use(createCapabilityRoutes({ aiSettingsService }));
  app.use(createImageRoutes({ imageService, imageUpload }));
  app.use(createCategoryRoutes({ categoryService }));
  app.use(createDashboardRoutes({ dashboardService }));
  app.use(createFieldRoutes({ customFieldService, aiFieldService }));
  app.use(createItemRoutes({ itemService }));
  app.use(createPhotoRoutes({ photoService, imageUpload }));
  app.use(createSystemRoutes({ maintenance, db, appVersion }));
  app.use(createUpdateRoutes({ updateService }));
  app.use(createBackupRoutes({ backupService, maintenance, restoreService, restoreUpload }));
  app.use(createResetRoutes({ resetService }));

  if (production) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
  }
  app.use(errorHandler);

  return { app, staging, restoreService, resetService, updateService, appVersion };
}
