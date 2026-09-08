import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
let connection: DatabaseSync | undefined;
export function sqlite() {
  if (connection) return connection;
  const root = process.env.LANTERN_DATA_DIR;
  if (!root)
    throw new Error('LANTERN_DATA_DIR must point to persistent storage.');
  mkdirSync(root, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(root, 'lantern.sqlite'));
  db.exec(
    'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;',
  );
  db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY)',
  );
  const migration = '0000_high_rhodey.sql';
  if (
    !db
      .prepare('SELECT name FROM schema_migrations WHERE name=?')
      .get(migration)
  ) {
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(readFileSync(join(process.cwd(), 'drizzle', migration), 'utf8'));
      db.prepare('INSERT INTO schema_migrations VALUES(?)').run(migration);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      db.close();
      throw e;
    }
  }
  connection = db;
  return db;
}
class Statement {
  constructor(
    readonly sql: string,
    readonly args: (string | number | null)[] = [],
  ) {}
  bind(...args: (string | number | null)[]) {
    return new Statement(this.sql, args);
  }
  async first<T>() {
    return (
      (sqlite()
        .prepare(this.sql)
        .get(...this.args) as T | undefined) ?? null
    );
  }
  async all<T>() {
    return {
      results: sqlite()
        .prepare(this.sql)
        .all(...this.args) as T[],
      success: true,
    };
  }
  execute() {
    const result = sqlite()
      .prepare(this.sql)
      .run(...this.args);
    return { success: true, meta: { changes: Number(result.changes) } };
  }
  async run() {
    return this.execute();
  }
}
export const db = {
  prepare(sql: string) {
    return new Statement(sql);
  },
  async batch(statements: Statement[]) {
    const conn = sqlite();
    conn.exec('BEGIN IMMEDIATE');
    try {
      const result = statements.map((s) => s.execute());
      conn.exec('COMMIT');
      return result;
    } catch (e) {
      conn.exec('ROLLBACK');
      throw e;
    }
  },
} as unknown as D1Database;
function imagePath(key: string) {
  if (!/^(portraits|scenes)\/[a-zA-Z0-9-]+\/[a-zA-Z0-9-]+$/.test(key))
    throw new Error('Invalid image key');
  const root = process.env.LANTERN_DATA_DIR;
  if (!root) throw new Error('Persistent image storage unavailable');
  return join(root, 'images', key.replaceAll('/', '_') + '.json');
}
const imageStore = {
  async put(
    key: string,
    data: ArrayBuffer,
    options: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string,string> },
  ) {
    const path = imagePath(key);
    mkdirSync(join(process.env.LANTERN_DATA_DIR!, 'images'), {
      recursive: true,
      mode: 0o700,
    });
    const temp = path + '.' + randomUUID();
    await writeFile(
      temp,
      JSON.stringify({
        body: Buffer.from(data).toString('base64'),
        httpMetadata: options.httpMetadata,
        customMetadata: options.customMetadata,
      }),
      { mode: 0o600 },
    );
    await rename(temp, path);
  },
  async get(key: string) {
    try {
      const object = JSON.parse(await readFile(imagePath(key), 'utf8'));
      return {
        body: new Uint8Array(Buffer.from(object.body, 'base64')),
        httpMetadata: object.httpMetadata,
        customMetadata: object.customMetadata,
      };
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw e;
    }
  },
  async head(key: string) {
    return this.get(key);
  },
  async delete(key: string) {
    await unlink(imagePath(key)).catch((e) => {
      if (e.code !== 'ENOENT') throw e;
    });
  },
};
export const bucket = imageStore as unknown as R2Bucket;
