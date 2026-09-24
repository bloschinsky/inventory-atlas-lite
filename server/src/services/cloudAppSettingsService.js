import { httpError } from '../httpError.js';

const MAX_LENGTH = 200;
const idPattern = /^[A-Za-z0-9._-]+$/;

const mask = secret => (secret ? `••••••••${secret.slice(-4)}` : '');

/*
  The OAuth app credentials (Dropbox app key and secret, Google client ID and secret) each provider
  connects with. They come from the server environment when it sets them; otherwise they are entered
  in Settings and kept in the `apps` section of the owner-only cloud credentials file, never in
  SQLite. The secret only leaves this module for the provider's token endpoint, never towards the
  client, which only ever sees whether one is saved and its last four characters.
*/
export class CloudAppSettingsService {
  constructor({ store, environment }) {
    this.store = store;
    // { [providerId]: { clientId, clientSecret } } from the environment; empty values are unset.
    this.environment = environment;
  }

  fromEnvironment(id) {
    return Boolean(this.environment[id]?.clientId);
  }

  saved(id) {
    return this.store.read().apps?.[id] ?? null;
  }

  resolve(id) {
    const source = this.fromEnvironment(id) ? this.environment[id] : this.saved(id);
    return { clientId: source?.clientId || '', clientSecret: source?.clientSecret || '' };
  }

  publicView(id) {
    const { clientId, clientSecret } = this.resolve(id);
    const source = this.fromEnvironment(id) ? 'environment' : (clientId ? 'settings' : null);
    return { source, clientId, hasClientSecret: Boolean(clientSecret), clientSecretMasked: mask(clientSecret) };
  }

  static text(value, message) {
    const text = typeof value === 'string' ? value.trim() : '';
    if (!text || text.length > MAX_LENGTH || !idPattern.test(text)) throw httpError(message);
    return text;
  }

  /*
    A new secret replaces the saved one only when it is entered. The saved secret belongs to the app
    it was entered for: a changed app key or client ID drops it unless it is entered again.
  */
  save(provider, input) {
    const { label, appFields } = provider;
    if (this.fromEnvironment(provider.id)) {
      throw httpError(`The ${label} app credentials are set in the server environment. Change them there.`, 409);
    }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw httpError(`Invalid ${label} app credentials.`);
    const clientId = CloudAppSettingsService.text(input.clientId, `Enter a valid ${label} ${appFields.idLabel}.`);
    const current = this.saved(provider.id);
    let clientSecret = '';
    if (input.clientSecret !== undefined && input.clientSecret !== null && input.clientSecret !== '') {
      clientSecret = CloudAppSettingsService.text(input.clientSecret, `Enter a valid ${label} ${appFields.secretLabel}.`);
    } else if (current?.clientId === clientId) {
      clientSecret = current.clientSecret || '';
    }
    if (appFields.secretRequired && !clientSecret) throw httpError(`Enter the ${label} ${appFields.secretLabel}.`);
    this.store.update(credentials => {
      credentials.apps = { ...credentials.apps, [provider.id]: { clientId, clientSecret } };
    });
  }

  clear(id) {
    this.store.update(credentials => {
      if (credentials.apps) delete credentials.apps[id];
    });
  }
}
