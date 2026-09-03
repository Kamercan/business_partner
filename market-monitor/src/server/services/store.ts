import { db } from '../db/index.js';
import { SOURCES } from '../catalog/sources.js';
import { SERIES } from '../catalog/series.js';
import type { CodeConfidence, FetchRun, Observation, SeriesDef, SourceDef } from '../../shared/types.js';

/** Katalogdaki kaynak ve serileri veritabanına yazar (idempotent). */
export function syncCatalog(): void {
  const conn = db();
  const upsertSource = conn.prepare(`
    INSERT INTO sources (id, org, name, tier, homepage, docs_url, license, auth, env_var, signup_url, why)
    VALUES (@id, @org, @name, @tier, @homepage, @docsUrl, @license, @auth, @envVar, @signupUrl, @why)
    ON CONFLICT(id) DO UPDATE SET
      org=excluded.org, name=excluded.name, tier=excluded.tier, homepage=excluded.homepage,
      docs_url=excluded.docs_url, license=excluded.license, auth=excluded.auth,
      env_var=excluded.env_var, signup_url=excluded.signup_url, why=excluded.why
  `);
  // confidence yalnızca katalog daha "iyimser" olduğunda güncellenir: sources:check
  // ile "verified" olmuş bir seriyi katalog geri "verify"a düşürmesin.
  const upsertSeries = conn.prepare(`
    INSERT INTO series (id, category, name_tr, name_en, unit, currency, freq, geo, source_id,
                        producer_source_id, connector, params, verify_url, confidence, note, featured, sort_order)
    VALUES (@id, @category, @nameTr, @nameEn, @unit, @currency, @freq, @geo, @sourceId,
            @producerSourceId, @connector, @params, @verifyUrl, @confidence, @note, @featured, @order)
    ON CONFLICT(id) DO UPDATE SET
      category=excluded.category, name_tr=excluded.name_tr, name_en=excluded.name_en,
      unit=excluded.unit, currency=excluded.currency, freq=excluded.freq, geo=excluded.geo,
      source_id=excluded.source_id, producer_source_id=excluded.producer_source_id,
      connector=excluded.connector, params=excluded.params,
      verify_url=excluded.verify_url, note=excluded.note, featured=excluded.featured,
      sort_order=excluded.sort_order,
      confidence=CASE WHEN series.confidence='verified' THEN 'verified' ELSE excluded.confidence END
  `);

  conn.transaction(() => {
    for (const s of SOURCES) {
      upsertSource.run({ ...s, envVar: s.envVar ?? null, signupUrl: s.signupUrl ?? null });
    }
    for (const s of SERIES) {
      upsertSeries.run({
        ...s,
        params: JSON.stringify(s.params),
        producerSourceId: s.producerSourceId ?? null,
        note: s.note ?? null,
        featured: s.featured ? 1 : 0,
        order: s.order ?? 100,
      });
    }
  })();
}

interface SeriesRow {
  id: string; category: string; name_tr: string; name_en: string; unit: string;
  currency: string | null; freq: string; geo: string; source_id: string;
  producer_source_id: string | null; connector: string;
  params: string; verify_url: string; confidence: string; note: string | null;
  featured: number; sort_order: number; enabled: number;
}

function toSeriesDef(r: SeriesRow): SeriesDef {
  return {
    id: r.id,
    category: r.category as SeriesDef['category'],
    nameTr: r.name_tr,
    nameEn: r.name_en,
    unit: r.unit,
    currency: r.currency,
    freq: r.freq as SeriesDef['freq'],
    geo: r.geo,
    sourceId: r.source_id,
    producerSourceId: r.producer_source_id ?? undefined,
    connector: r.connector,
    params: JSON.parse(r.params) as SeriesDef['params'],
    verifyUrl: r.verify_url,
    confidence: r.confidence as CodeConfidence,
    note: r.note ?? undefined,
    featured: r.featured === 1,
    order: r.sort_order,
  };
}

export function listSeries(filter: { category?: string; featured?: boolean } = {}): SeriesDef[] {
  const clauses = ['enabled = 1'];
  const params: unknown[] = [];
  if (filter.category) { clauses.push('category = ?'); params.push(filter.category); }
  if (filter.featured) { clauses.push('featured = 1'); }
  const rows = db()
    .prepare<unknown[], SeriesRow>(`SELECT * FROM series WHERE ${clauses.join(' AND ')} ORDER BY sort_order, id`)
    .all(...params);
  return rows.map(toSeriesDef);
}

export function getSeries(id: string): SeriesDef | null {
  const row = db().prepare<[string], SeriesRow>('SELECT * FROM series WHERE id = ?').get(id);
  return row ? toSeriesDef(row) : null;
}

export function listSources(): SourceDef[] {
  const rows = db().prepare<[], {
    id: string; org: string; name: string; tier: string; homepage: string; docs_url: string;
    license: string; auth: string; env_var: string | null; signup_url: string | null; why: string;
  }>('SELECT * FROM sources ORDER BY tier, org').all();
  return rows.map((r) => ({
    id: r.id, org: r.org, name: r.name, tier: r.tier as SourceDef['tier'],
    homepage: r.homepage, docsUrl: r.docs_url, license: r.license,
    auth: r.auth as SourceDef['auth'], envVar: r.env_var ?? undefined,
    signupUrl: r.signup_url ?? undefined, why: r.why,
  }));
}

/** Gözlemleri yazar; var olan dönemlerin değerini günceller. Yazılan satır sayısını döndürür. */
export function upsertObservations(seriesId: string, obs: Observation[]): number {
  const stmt = db().prepare(`
    INSERT INTO observations (series_id, period, value, revised_at)
    VALUES (?, ?, ?, datetime('now'))
    ON CONFLICT(series_id, period) DO UPDATE SET
      value = excluded.value,
      revised_at = CASE WHEN observations.value <> excluded.value THEN excluded.revised_at ELSE observations.revised_at END
  `);
  const run = db().transaction((rows: Observation[]) => {
    for (const o of rows) stmt.run(seriesId, o.period, o.value);
  });
  run(obs);
  return obs.length;
}

export function getObservations(seriesId: string, from?: string, to?: string): Observation[] {
  const clauses = ['series_id = ?'];
  const params: unknown[] = [seriesId];
  if (from) { clauses.push('period >= ?'); params.push(from); }
  if (to) { clauses.push('period <= ?'); params.push(to); }
  return db()
    .prepare<unknown[], Observation>(
      `SELECT period, value FROM observations WHERE ${clauses.join(' AND ')} ORDER BY period`,
    )
    .all(...params);
}

export function observationCount(seriesId: string): number {
  const row = db()
    .prepare<[string], { n: number }>('SELECT COUNT(*) AS n FROM observations WHERE series_id = ?')
    .get(seriesId);
  return row?.n ?? 0;
}

// ── Çalıştırma kayıtları ────────────────────────────────────────────────────

export function startRun(seriesId: string): number {
  const info = db()
    .prepare(`INSERT INTO fetch_runs (series_id, started_at, status) VALUES (?, datetime('now'), 'running')`)
    .run(seriesId);
  return Number(info.lastInsertRowid);
}

export function finishRun(id: number, status: 'ok' | 'error' | 'skipped', rows: number, message?: string): void {
  db().prepare(`UPDATE fetch_runs SET finished_at = datetime('now'), status = ?, rows = ?, message = ? WHERE id = ?`)
    .run(status, rows, message ?? null, id);
}

export function lastRun(seriesId: string): FetchRun | null {
  const r = db()
    .prepare<[string], { id: number; series_id: string; started_at: string; finished_at: string | null; status: string; rows: number; message: string | null }>(
      'SELECT * FROM fetch_runs WHERE series_id = ? ORDER BY id DESC LIMIT 1',
    )
    .get(seriesId);
  return r
    ? { id: r.id, seriesId: r.series_id, startedAt: r.started_at, finishedAt: r.finished_at, status: r.status as FetchRun['status'], rows: r.rows, message: r.message }
    : null;
}

export function allLastRuns(): Map<string, FetchRun> {
  const rows = db()
    .prepare<[], { id: number; series_id: string; started_at: string; finished_at: string | null; status: string; rows: number; message: string | null }>(
      `SELECT * FROM fetch_runs WHERE id IN (SELECT MAX(id) FROM fetch_runs GROUP BY series_id)`,
    )
    .all();
  return new Map(rows.map((r) => [r.series_id, {
    id: r.id, seriesId: r.series_id, startedAt: r.started_at, finishedAt: r.finished_at,
    status: r.status as FetchRun['status'], rows: r.rows, message: r.message,
  }]));
}

export function setConfidence(seriesId: string, confidence: CodeConfidence): void {
  db().prepare('UPDATE series SET confidence = ? WHERE id = ?').run(confidence, seriesId);
}

export function setSetting(key: string, value: string): void {
  db().prepare(`INSERT INTO settings (key, value) VALUES (?, ?)
                ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(key, value);
}

export function getSetting(key: string): string | null {
  return db().prepare<[string], { value: string }>('SELECT value FROM settings WHERE key = ?').get(key)?.value ?? null;
}
