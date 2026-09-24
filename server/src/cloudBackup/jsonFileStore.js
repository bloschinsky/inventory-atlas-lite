import fs from 'node:fs';

/*
  One small JSON document on disk, written atomically with owner-only permissions, the same way the
  AI settings file is. A missing or unreadable file reads as the defaults instead of failing.
*/
export class JsonFileStore {
  constructor({ file, defaults }) {
    this.file = file;
    this.defaults = defaults;
  }

  read() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved && typeof saved === 'object' && !Array.isArray(saved)) return { ...this.defaults(), ...saved };
    } catch (error) {
      if (error.code !== 'ENOENT') console.warn(`Ignoring unreadable ${this.file}.`);
    }
    return this.defaults();
  }

  write(value) {
    const temporaryPath = `${this.file}.tmp`;
    fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(temporaryPath, this.file);
    try { fs.chmodSync(this.file, 0o600); } catch { /* Windows may not apply POSIX file modes. */ }
  }

  // Reads, lets `change` modify the document in place, and writes it back.
  update(change) {
    const value = this.read();
    change(value);
    this.write(value);
    return value;
  }
}
