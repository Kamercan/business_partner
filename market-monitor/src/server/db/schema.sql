-- Piyasa & Maliyet Göstergeleri Panosu — şema
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sources (
  id          TEXT PRIMARY KEY,
  org         TEXT NOT NULL,
  name        TEXT NOT NULL,
  tier        TEXT NOT NULL,
  homepage    TEXT NOT NULL,
  docs_url    TEXT NOT NULL,
  license     TEXT NOT NULL,
  auth        TEXT NOT NULL,
  env_var     TEXT,
  signup_url  TEXT,
  why         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS series (
  id            TEXT PRIMARY KEY,
  category      TEXT NOT NULL,
  name_tr       TEXT NOT NULL,
  name_en       TEXT NOT NULL,
  unit          TEXT NOT NULL,
  currency      TEXT,
  freq          TEXT NOT NULL,
  geo           TEXT NOT NULL,
  source_id     TEXT NOT NULL REFERENCES sources(id),
  producer_source_id TEXT REFERENCES sources(id),
  connector     TEXT NOT NULL,
  params        TEXT NOT NULL DEFAULT '{}',   -- JSON
  verify_url    TEXT NOT NULL,
  confidence    TEXT NOT NULL,
  note          TEXT,
  featured      INTEGER NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 100,
  enabled       INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_series_category ON series(category);
CREATE INDEX IF NOT EXISTS idx_series_source   ON series(source_id);

-- Dönem her zaman dönem BAŞLANGICI olarak saklanır (YYYY-MM-DD), böylece
-- günlük/haftalık/aylık/yıllık seriler tek bir eksende hizalanabilir.
CREATE TABLE IF NOT EXISTS observations (
  series_id  TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,
  value      REAL NOT NULL,
  revised_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (series_id, period)
) WITHOUT ROWID;
CREATE INDEX IF NOT EXISTS idx_obs_period ON observations(period);

CREATE TABLE IF NOT EXISTS fetch_runs (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id   TEXT NOT NULL,
  started_at  TEXT NOT NULL,
  finished_at TEXT,
  status      TEXT NOT NULL,          -- ok | error | skipped | running
  rows        INTEGER NOT NULL DEFAULT 0,
  message     TEXT
);
CREATE INDEX IF NOT EXISTS idx_runs_series ON fetch_runs(series_id, id DESC);

-- Elle / CSV ile girilen değerlerin izi. Sözleşme fiyatı, abonelik verisi
-- (Platts, MEPS, SteelOrbis) ve resmî PDF bültenlerinden okunan değerler burada
-- kaynağıyla birlikte kayda geçer; observations tablosuna da yazılır.
CREATE TABLE IF NOT EXISTS manual_entries (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  series_id  TEXT NOT NULL REFERENCES series(id) ON DELETE CASCADE,
  period     TEXT NOT NULL,
  value      REAL NOT NULL,
  source_ref TEXT NOT NULL,           -- belge adı / bülten no / URL
  entered_by TEXT NOT NULL DEFAULT 'local',
  entered_at TEXT NOT NULL DEFAULT (datetime('now')),
  note       TEXT
);
CREATE INDEX IF NOT EXISTS idx_manual_series ON manual_entries(series_id, period);

-- Kur tablosu: parasal serileri ortak para birimine çevirmek için.
CREATE TABLE IF NOT EXISTS fx_rates (
  base      TEXT NOT NULL,
  quote     TEXT NOT NULL,
  period    TEXT NOT NULL,
  rate      REAL NOT NULL,            -- 1 base = rate quote
  PRIMARY KEY (base, quote, period)
) WITHOUT ROWID;

CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
