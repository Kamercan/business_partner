import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';

const here = path.dirname(fileURLToPath(import.meta.url));

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });
fs.mkdirSync(config.storageDir, { recursive: true });

export const db = new Database(config.dbFile);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');
db.pragma('busy_timeout = 5000');

/**
 * Var olan bir tabloya eksik sütunu ekler.
 * `CREATE TABLE IF NOT EXISTS` yalnızca yeni kurulumları kapsadığı için,
 * çalışan veritabanlarına sonradan eklenen alanlar buradan geçer.
 */
function addColumnIfMissing(table: string, column: string, definition: string): void {
  const columns = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
  if (columns.some((c) => c.name === column)) return;
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  console.log(`· şema güncellendi: ${table}.${column} eklendi`);
}

/** Şemayı uygular (idempotent — CREATE TABLE IF NOT EXISTS + eksik sütunlar). */
export function migrate(): void {
  const schema = fs.readFileSync(path.join(here, 'schema.sql'), 'utf8');
  db.exec(schema);

  // Tedarikçi portalı girişi (sonradan eklendi)
  addColumnIfMissing('suppliers', 'password_hash', 'TEXT');
  addColumnIfMissing('suppliers', 'portal_last_login_at', 'TEXT');

  migratePortalTokenPurposes();
}

/**
 * `portal_tokens.purpose` CHECK kısıtına SET_PASSWORD eklendi. SQLite'ta kısıt
 * doğrudan değiştirilemediği için tablo yeniden kurulur; kayıtlar korunur.
 * (Bağlantı jetonları kısa ömürlüdür, taşıma maliyeti yok denecek kadar azdır.)
 */
function migratePortalTokenPurposes(): void {
  const row = db
    .prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'portal_tokens'")
    .get() as { sql: string } | undefined;
  if (!row || row.sql.includes('SET_PASSWORD')) return;

  db.exec(`
    PRAGMA foreign_keys = OFF;
    BEGIN;
    ALTER TABLE portal_tokens RENAME TO portal_tokens_old;
    CREATE TABLE portal_tokens (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash   TEXT NOT NULL UNIQUE,
      purpose      TEXT NOT NULL CHECK (purpose IN ('TRACK','INFO_REQUEST','NCR_RESPONSE','DOC_EXCHANGE','SET_PASSWORD')),
      entity_type  TEXT NOT NULL CHECK (entity_type IN ('APPLICATION','SUPPLIER','NCR')),
      entity_id    INTEGER NOT NULL,
      email        TEXT NOT NULL,
      expires_at   TEXT NOT NULL,
      used_at      TEXT,
      revoked      INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    INSERT INTO portal_tokens (id, token_hash, purpose, entity_type, entity_id, email, expires_at, used_at, revoked, created_at)
      SELECT id, token_hash, purpose, entity_type, entity_id, email, expires_at, used_at, revoked, created_at
        FROM portal_tokens_old;
    DROP TABLE portal_tokens_old;
    CREATE INDEX IF NOT EXISTS idx_portal_entity ON portal_tokens(entity_type, entity_id);
    COMMIT;
    PRAGMA foreign_keys = ON;
  `);
  console.log('· şema güncellendi: portal_tokens.purpose SET_PASSWORD desteği eklendi');
}

/** Bir transaction içinde çalıştırır. */
export function tx<T>(fn: () => T): T {
  return db.transaction(fn)();
}

export function getSetting(key: string, fallback: string): string {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function getSettingNumber(key: string, fallback: number): number {
  const n = Number(getSetting(key, String(fallback)));
  return Number.isFinite(n) ? n : fallback;
}

export function setSetting(key: string, value: string): void {
  db.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
  ).run(key, value);
}
