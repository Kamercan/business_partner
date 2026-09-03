import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = dirname(fileURLToPath(import.meta.url));

let instance: Database.Database | null = null;

export function db(): Database.Database {
  if (instance) return instance;
  mkdirSync(dirname(config.dbPath), { recursive: true });
  const conn = new Database(config.dbPath);
  conn.pragma('journal_mode = WAL');
  conn.pragma('foreign_keys = ON');
  const schemaPath = [join(here, 'schema.sql'), join(here, '../../src/server/db/schema.sql')]
    .find((p) => existsSync(p));
  if (!schemaPath) throw new Error('schema.sql bulunamadı');
  conn.exec(readFileSync(schemaPath, 'utf8'));
  migrate(conn);
  instance = conn;
  return conn;
}

export function closeDb(): void {
  instance?.close();
  instance = null;
}

/**
 * Şema `CREATE TABLE IF NOT EXISTS` ile kurulduğu için var olan bir tabloya
 * sonradan eklenen sütunlar oluşmaz. Eksik sütunlar burada tamamlanır; böylece
 * mevcut veritabanları silinmeden sürüm atlayabilir.
 */
function migrate(conn: Database.Database): void {
  const columns = conn.prepare<[], { name: string }>('PRAGMA table_info(series)').all().map((c) => c.name);
  if (!columns.includes('producer_source_id')) {
    conn.exec('ALTER TABLE series ADD COLUMN producer_source_id TEXT');
  }
}
