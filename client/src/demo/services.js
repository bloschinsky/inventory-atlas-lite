import { BulkReplaceRepository } from '../../../server/src/repositories/bulkReplaceRepository.js';
import { CategoryRepository } from '../../../server/src/repositories/categoryRepository.js';
import { ChecklistRepository } from '../../../server/src/repositories/checklistRepository.js';
import { ChecklistRunRepository } from '../../../server/src/repositories/checklistRunRepository.js';
import { CustomFieldRepository } from '../../../server/src/repositories/customFieldRepository.js';
import { DashboardRepository } from '../../../server/src/repositories/dashboardRepository.js';
import { DatabaseMetadataRepository } from '../../../server/src/repositories/databaseMetadataRepository.js';
import { ItemHistoryRepository } from '../../../server/src/repositories/itemHistoryRepository.js';
import { ItemPhotoRepository } from '../../../server/src/repositories/itemPhotoRepository.js';
import { ItemRepository } from '../../../server/src/repositories/itemRepository.js';
import { ItemTemplateRepository } from '../../../server/src/repositories/itemTemplateRepository.js';
import { applySchema } from '../../../server/src/schema.js';
import { BulkReplaceService } from '../../../server/src/services/bulkReplaceService.js';
import { CategoryService } from '../../../server/src/services/categoryService.js';
import { ChecklistRunService } from '../../../server/src/services/checklistRunService.js';
import { ChecklistService } from '../../../server/src/services/checklistService.js';
import { CustomFieldService } from '../../../server/src/services/customFieldService.js';
import { DashboardService } from '../../../server/src/services/dashboardService.js';
import { DatabaseMetadataService } from '../../../server/src/services/databaseMetadataService.js';
import { ItemHistoryService } from '../../../server/src/services/itemHistoryService.js';
import { ItemLifecycleService } from '../../../server/src/services/itemLifecycleService.js';
import { ItemService } from '../../../server/src/services/itemService.js';
import { ItemTransferService } from '../../../server/src/services/itemTransferService.js';
import { ItemTemplateService } from '../../../server/src/services/itemTemplateService.js';
import { PhotoService } from '../../../server/src/services/photoService.js';
import { openDemoDatabase } from './sqlite.js';

/*
  The inventory half of server/src/app.js for the public demo: the same schema, repositories, and
  services over an in-memory database. Nothing that needs the file system, a secret, or the network
  is built here. `SQL` is an initialized sql.js module.
*/
export function createDemoServices(SQL) {
  const db = openDemoDatabase(SQL);
  applySchema(db);

  const categoryRepository = new CategoryRepository(db);
  const customFieldRepository = new CustomFieldRepository(db);
  const itemRepository = new ItemRepository(db);
  const itemPhotoRepository = new ItemPhotoRepository(db);
  const checklistRepository = new ChecklistRepository(db);
  const checklistRunRepository = new ChecklistRunRepository(db);
  const itemHistoryRepository = new ItemHistoryRepository(db);
  const categoryService = new CategoryService(categoryRepository);
  const itemHistoryService = new ItemHistoryService({ itemHistoryRepository });
  const itemService = new ItemService({ itemRepository, customFieldRepository, itemPhotoRepository, categoryRepository, itemHistoryService });

  return {
    db,
    categoryService,
    customFieldService: new CustomFieldService(customFieldRepository, categoryService),
    itemService,
    itemTransferService: new ItemTransferService({ itemRepository, itemHistoryRepository, itemHistoryService }),
    itemLifecycleService: new ItemLifecycleService({ itemRepository, itemService, itemHistoryService }),
    bulkReplaceService: new BulkReplaceService({ bulkReplaceRepository: new BulkReplaceRepository(db), itemHistoryService }),
    databaseMetadataService: new DatabaseMetadataService({ databaseMetadataRepository: new DatabaseMetadataRepository(db) }),
    itemTemplateService: new ItemTemplateService({
      itemTemplateRepository: new ItemTemplateRepository(db), categoryRepository, customFieldRepository
    }),
    checklistService: new ChecklistService({ checklistRepository, checklistRunRepository, itemRepository }),
    checklistRunService: new ChecklistRunService({ checklistRepository, checklistRunRepository, itemRepository }),
    photoService: new PhotoService({ itemRepository, itemPhotoRepository }),
    dashboardService: new DashboardService({ dashboardRepository: new DashboardRepository(db), categoryRepository })
  };
}
