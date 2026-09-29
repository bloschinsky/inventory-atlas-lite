import { httpError } from '../httpError.js';
import { requiredText } from '../../../shared/itemValidation.js';

export const DATABASE_NAME_MAX_LENGTH = 100;

/*
  The identity of the current database: its UUID, name, timestamps, and schema version. Only the name
  can be changed here; the other values are managed by the schema code and the write triggers in db.js.
*/
export class DatabaseMetadataService {
  constructor({ databaseMetadataRepository }) {
    this.metadata = databaseMetadataRepository;
  }

  get() {
    const metadata = this.metadata.get();
    // applySchema() always creates the row, so its absence means the database was changed outside the app.
    if (!metadata) throw httpError(500, 'DATABASE_METADATA_MISSING');
    return metadata;
  }

  rename(input) {
    const name = requiredText(input?.name, 'DATABASE_NAME_REQUIRED');
    if (name.length > DATABASE_NAME_MAX_LENGTH) throw httpError(400, 'DATABASE_NAME_TOO_LONG', { max: DATABASE_NAME_MAX_LENGTH });
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f]/.test(name)) throw httpError(400, 'DATABASE_NAME_INVALID');
    if (!this.metadata.updateName(name)) throw httpError(500, 'DATABASE_METADATA_MISSING');
    return this.get();
  }
}
