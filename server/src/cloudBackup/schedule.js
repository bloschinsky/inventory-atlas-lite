import { httpError } from '../httpError.js';

export const MAX_KEEP_LAST = 365;

export const defaultSettings = () => ({
  schedule: { enabled: false, provider: null, frequency: 'daily', weekday: 0, time: '03:00' },
  retention: { mode: 'all', keep: 10 }
});

// Every cloud backup is named this way; retention only ever considers files with exactly this name.
const ownBackupName = /^inventory-atlas-lite-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z\.sqlite$/;

export const backupFileName = date => `inventory-atlas-lite-${date.toISOString().slice(0, 19).replace(/:/g, '-')}Z.sqlite`;
export const isOwnBackupName = name => ownBackupName.test(name);

/*
  The next run strictly after `from`, in the server's own time zone: the time of day is a local
  wall-clock time, and the result is the UTC instant it falls on. The hours are set again after the
  date moves so a daylight-saving change does not shift the run by an hour.
*/
export function nextRunAfter(schedule, from) {
  const [hours, minutes] = schedule.time.split(':').map(Number);
  const next = new Date(from);
  next.setHours(hours, minutes, 0, 0);
  if (schedule.frequency === 'weekly') next.setDate(next.getDate() + ((schedule.weekday - next.getDay() + 7) % 7));
  if (next <= from) next.setDate(next.getDate() + (schedule.frequency === 'weekly' ? 7 : 1));
  next.setHours(hours, minutes, 0, 0);
  return next.toISOString();
}

// Validates a submitted settings document. A schedule can only be enabled for a connected provider.
export function validateSettings(input, connectedProviders) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError('Invalid cloud backup settings.');
  const schedule = input.schedule ?? {};
  const retention = input.retention ?? {};
  if (typeof schedule.enabled !== 'boolean') throw httpError('Automatic backups must be enabled or disabled.');
  if (!['daily', 'weekly'].includes(schedule.frequency)) throw httpError('Frequency must be daily or weekly.');
  const weekday = schedule.weekday ?? 0;
  if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) throw httpError('Choose a day of the week.');
  if (typeof schedule.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(schedule.time)) throw httpError('Time must be in HH:MM format.');
  const provider = schedule.provider || null;
  if (schedule.enabled && !connectedProviders.includes(provider)) throw httpError('Choose a connected provider for automatic backups.');
  if (!['all', 'last'].includes(retention.mode)) throw httpError('Retention must keep all backups or the last N backups.');
  const keep = retention.keep ?? defaultSettings().retention.keep;
  if (!Number.isInteger(keep) || keep < 1 || keep > MAX_KEEP_LAST) throw httpError(`Keep between 1 and ${MAX_KEEP_LAST} backups.`);
  return {
    schedule: { enabled: schedule.enabled, provider, frequency: schedule.frequency, weekday, time: schedule.time },
    retention: { mode: retention.mode, keep }
  };
}
