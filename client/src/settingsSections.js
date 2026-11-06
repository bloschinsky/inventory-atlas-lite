import { IconAdjustmentsHorizontal, IconCloudUpload, IconDatabase, IconDevices, IconKey, IconSparkles, IconUsers } from '@tabler/icons-vue';
import { PERMISSIONS } from '../../shared/permissions.js';
import { can } from './auth.js';
import AiSettings from './components/settings/AiSettings.vue';
import ApiAccessSettings from './components/settings/ApiAccessSettings.vue';
import CloudBackupSettings from './components/settings/CloudBackupSettings.vue';
import DatabaseSettings from './components/settings/DatabaseSettings.vue';
import InterfaceSettings from './components/settings/InterfaceSettings.vue';
import SessionsSettings from './components/settings/SessionsSettings.vue';
import UsersSettings from './components/settings/UsersSettings.vue';

/*
  Single source of truth for the Settings routes, the desktop section navigation, and the phone
  section selector; labels are translation keys. A new section is one entry here and one component.
  A `serverOnly` section needs secrets or the server's files, so the public demo explains it instead.
  A section with a `permission` is shown, and reachable, only for a principal that has it; the
  server refuses its requests to anyone else either way.
*/
const { settingsManage, securityManage } = PERMISSIONS;

export const settingsGroups = [
  { id: 'general', label: 'settings.groups.general', sections: [
    { path: 'interface', label: 'settings.interface.title', icon: IconAdjustmentsHorizontal, component: InterfaceSettings }
  ] },
  { id: 'data', label: 'settings.groups.data', sections: [
    { path: 'database', label: 'settings.database.title', icon: IconDatabase, component: DatabaseSettings, permission: settingsManage },
    { path: 'cloud-backup', label: 'cloud.title', icon: IconCloudUpload, component: CloudBackupSettings, serverOnly: true, permission: settingsManage }
  ] },
  { id: 'services', label: 'settings.groups.services', sections: [
    { path: 'ai', label: 'settings.ai.title', icon: IconSparkles, component: AiSettings, serverOnly: true, permission: settingsManage }
  ] },
  { id: 'security', label: 'settings.groups.security', sections: [
    { path: 'users', label: 'security.users.title', icon: IconUsers, component: UsersSettings, serverOnly: true, permission: securityManage },
    { path: 'api-access', label: 'security.tokens.title', icon: IconKey, component: ApiAccessSettings, serverOnly: true, permission: securityManage },
    // Everyone's own sessions and password.
    { path: 'sessions', label: 'security.sessions.title', icon: IconDevices, component: SessionsSettings, serverOnly: true }
  ] }
];

export const settingsSections = settingsGroups.flatMap(group => group.sections);
export const settingsPath = section => `/settings/${section.path}`;
export const defaultSettingsPath = settingsPath(settingsSections[0]);

// The groups and sections the signed-in principal may open.
export const visibleSettingsGroups = () => settingsGroups
  .map(group => ({ ...group, sections: group.sections.filter(section => !section.permission || can(section.permission)) }))
  .filter(group => group.sections.length);
