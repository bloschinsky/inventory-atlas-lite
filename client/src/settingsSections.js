import { IconAdjustmentsHorizontal, IconCloudUpload, IconDatabase, IconSparkles } from '@tabler/icons-vue';
import AiSettings from './components/settings/AiSettings.vue';
import CloudBackupSettings from './components/settings/CloudBackupSettings.vue';
import DatabaseSettings from './components/settings/DatabaseSettings.vue';
import InterfaceSettings from './components/settings/InterfaceSettings.vue';

/*
  Single source of truth for the Settings routes, the desktop section navigation, and the phone
  section selector; labels are translation keys. A new section is one entry here and one component.
*/
export const settingsGroups = [
  { id: 'general', label: 'settings.groups.general', sections: [
    { path: 'interface', label: 'settings.interface.title', icon: IconAdjustmentsHorizontal, component: InterfaceSettings }
  ] },
  { id: 'data', label: 'settings.groups.data', sections: [
    { path: 'database', label: 'settings.database.title', icon: IconDatabase, component: DatabaseSettings },
    { path: 'cloud-backup', label: 'cloud.title', icon: IconCloudUpload, component: CloudBackupSettings }
  ] },
  { id: 'services', label: 'settings.groups.services', sections: [
    { path: 'ai', label: 'settings.ai.title', icon: IconSparkles, component: AiSettings }
  ] }
];

export const settingsSections = settingsGroups.flatMap(group => group.sections);
export const settingsPath = section => `/settings/${section.path}`;
export const defaultSettingsPath = settingsPath(settingsSections[0]);
