/*
  The part of the better-sqlite3 connection API the server repositories use, over an in-memory sql.js
  database. It lets the public demo run the real schema, repositories, and services in the browser.
  `SQL` is an initialized sql.js module; the caller loads it the way its environment needs.
*/

// better-sqlite3 binds plain objects by name (@name, :name, $name) and everything else by position,
// flattening arrays; sql.js wants either one array or one object whose keys carry the prefix.
const isNamed = value => value !== null && typeof value === 'object' && !Array.isArray(value) && !ArrayBuffer.isView(value);

const bindings = args => {
  const named = args.find(isNamed);
  if (named) {
    return Object.fromEntries(Object.entries(named).flatMap(([key, value]) => ['@', ':', '$'].map(prefix => [prefix + key, value])));
  }
  return args.flat();
};

// The constraint codes the services check, which sql.js only reports in the message.
const CONSTRAINT_CODES = [
  ['UNIQUE constraint failed', 'SQLITE_CONSTRAINT_UNIQUE'],
  ['FOREIGN KEY constraint failed', 'SQLITE_CONSTRAINT_FOREIGNKEY'],
  ['CHECK constraint failed', 'SQLITE_CONSTRAINT_CHECK'],
  ['NOT NULL constraint failed', 'SQLITE_CONSTRAINT_NOTNULL']
];

const withCode = error => {
  const match = CONSTRAINT_CODES.find(([text]) => error?.message?.startsWith(text));
  if (match) error.code = match[1];
  return error;
};

export function openDemoDatabase(SQL) {
  const database = new SQL.Database();
  let depth = 0;

  // Every call compiles, runs, and frees its own statement: nothing leaks between calls.
  const execute = (sql, args, collect) => {
    let statement;
    try {
      statement = database.prepare(sql);
      statement.bind(bindings(args));
      const rows = [];
      while (statement.step()) {
        rows.push(statement.getAsObject());
        if (collect === 'first') break;
      }
      return rows;
    } catch (error) {
      throw withCode(error);
    } finally {
      statement?.free();
    }
  };

  const connection = {
    open: true,
    prepare: sql => ({
      run: (...args) => {
        execute(sql, args, 'none');
        return {
          changes: database.getRowsModified(),
          lastInsertRowid: database.exec('SELECT last_insert_rowid()')[0].values[0][0]
        };
      },
      get: (...args) => execute(sql, args, 'first')[0],
      all: (...args) => execute(sql, args, 'all')
    }),
    exec: sql => {
      try {
        database.exec(sql);
      } catch (error) {
        throw withCode(error);
      }
      return connection;
    },
    pragma: (source, { simple = false } = {}) => {
      const rows = execute(`PRAGMA ${source}`, [], 'all');
      return simple ? Object.values(rows[0] ?? {})[0] : rows;
    },
    // Nested transactions become savepoints, as in better-sqlite3.
    transaction: fn => (...args) => {
      const savepoint = `demo_${depth}`;
      database.exec(depth ? `SAVEPOINT ${savepoint}` : 'BEGIN');
      depth += 1;
      try {
        const result = fn(...args);
        depth -= 1;
        database.exec(depth ? `RELEASE ${savepoint}` : 'COMMIT');
        return result;
      } catch (error) {
        depth -= 1;
        database.exec(depth ? `ROLLBACK TO ${savepoint}; RELEASE ${savepoint}` : 'ROLLBACK');
        throw error;
      }
    },
    close: () => {
      database.close();
      connection.open = false;
    }
  };
  connection.pragma('foreign_keys = ON');
  return connection;
}
