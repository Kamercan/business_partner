import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db/index.js';
import { config } from '../config.js';
import { CATEGORY_TR } from '../catalog/labels.js';
import { seriesMeta, resolveSeries, sourceHealth, fxTable, invalidateFxCache } from '../services/query.js';
import { ingestAll, ingestSeries } from '../services/ingest.js';
import { isRefreshing, lastIngestAt, refreshNow } from '../services/scheduler.js';
import { getSeries, listSources, upsertObservations } from '../services/store.js';
import { parseCsvObjects, toCsv } from '../lib/csv.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { seedReferences } from '../connectors/seed.js';
import type { Transform } from '../../shared/types.js';

export const api = Router();

const TRANSFORMS = ['raw', 'yoy', 'mom', 'index', 'cumulative'] as const;

/**
 * Elle veri girilebilen bağlayıcılar. `seed` de buradadır: tohum dosyası
 * başlangıç verisini taşır, yeni resmî kararlar arayüzden eklenir ve dosyanın
 * üzerine yazar — depoyu değiştirmek gerekmez.
 */
const EDITABLE = new Set(['manual', 'seed']);
const rangeSchema = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  transform: z.enum(TRANSFORMS).optional(),
  currency: z.enum(['TRY', 'USD', 'EUR']).optional(),
});

// ── Sağlık ve durum ─────────────────────────────────────────────────────────

api.get('/health', (_req, res) => {
  const row = db().prepare<[], { n: number }>('SELECT COUNT(*) AS n FROM observations').get();
  res.json({ ok: true, observations: row?.n ?? 0, lastIngestAt: lastIngestAt(), refreshing: isRefreshing() });
});

api.get('/status', (_req, res) => {
  const metas = seriesMeta();
  res.json({
    lastIngestAt: lastIngestAt(),
    refreshing: isRefreshing(),
    refreshMinutes: config.refreshMinutes,
    total: metas.length,
    withData: metas.filter((m) => m.count > 0).length,
    stale: metas.filter((m) => m.count > 0 && m.stale).length,
    failing: metas.filter((m) => m.lastRunStatus === 'error').length,
    needsKey: metas.filter((m) => m.keyMissing).length,
    manualPending: metas.filter((m) => m.series.connector === 'manual' && m.count === 0).length,
  });
});

// ── Katalog ─────────────────────────────────────────────────────────────────

api.get('/catalog', (req, res) => {
  const category = typeof req.query.category === 'string' ? req.query.category : undefined;
  res.json({
    categories: Object.entries(CATEGORY_TR).map(([id, v]) => ({ id, ...v })),
    series: seriesMeta({ category }),
  });
});

api.get('/sources', (_req, res) => {
  res.json({ sources: listSources(), health: sourceHealth() });
});

/** Tohum serilerin dönem bazlı resmî belge referansları. */
api.get('/series/:id/references', (req, res) => {
  const series = getSeries(req.params.id);
  if (!series) return res.status(404).json({ error: 'Seri bulunamadı' });
  if (EDITABLE.has(series.connector)) {
    const fromSeed = series.connector === 'seed' ? seedReferences(String(series.params.file)) : {};
    const rows = db().prepare<[string, string], { period: string; source_ref: string; note: string | null; entered_at: string }>(
      `SELECT period, source_ref, note, entered_at FROM manual_entries
        WHERE series_id = ? AND id IN (SELECT MAX(id) FROM manual_entries WHERE series_id = ? GROUP BY period)`,
    ).all(req.params.id, req.params.id);
    return res.json({
      references: {
        ...fromSeed,
        ...Object.fromEntries(rows.map((r) => [r.period, { source: r.source_ref, note: r.note ?? undefined }])),
      },
    });
  }
  return res.json({ references: {} });
});

// ── Seri okuma ──────────────────────────────────────────────────────────────

api.get('/series/:id', (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz parametre', detail: parsed.error.flatten() });
  const out = resolveSeries(req.params.id, parsed.data);
  if (!out) return res.status(404).json({ error: 'Seri bulunamadı' });
  return res.json(out);
});

/** Çoklu seri karşılaştırma — grafiğin tek isteği. */
api.get('/compare', (req, res) => {
  const idsRaw = typeof req.query.ids === 'string' ? req.query.ids : '';
  const ids = idsRaw.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 8);
  if (ids.length === 0) return res.status(400).json({ error: 'En az bir seri seçin (ids=...)' });

  const parsed = rangeSchema.safeParse(req.query);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz parametre' });

  const series = ids.map((id) => resolveSeries(id, parsed.data)).filter((s): s is NonNullable<typeof s> => s !== null);
  const missing = ids.filter((id) => !series.some((s) => s.series.id === id));

  // Birimler farklıysa ham karşılaştırma yanıltıcıdır; arayüz bunu uyarı olarak gösterir.
  const units = new Set(series.map((s) => s.displayUnit));
  return res.json({
    series,
    missing,
    mixedUnits: (parsed.data.transform ?? 'raw') === 'raw' && units.size > 1,
    units: [...units],
  });
});

api.get('/dashboard', (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  const opts = parsed.success ? parsed.data : {};
  const featured = seriesMeta({ featured: true });
  res.json({
    cards: featured.map((m) => {
      const resolved = resolveSeries(m.series.id, { ...opts, transform: 'raw' });
      return {
        meta: m,
        summary: resolved?.summary ?? null,
        unit: resolved?.displayUnit ?? m.series.unit,
        spark: (resolved?.observations ?? []).slice(-60),
      };
    }),
  });
});

// ── Dışa aktarım ────────────────────────────────────────────────────────────

api.get('/export/:id.csv', (req, res) => {
  const parsed = rangeSchema.safeParse(req.query);
  const out = resolveSeries(req.params.id, parsed.success ? parsed.data : {});
  if (!out) return res.status(404).json({ error: 'Seri bulunamadı' });
  const csv = toCsv(
    ['donem', 'deger', 'birim', 'seri', 'kaynak', 'dogrulama_linki'],
    out.observations.map((o) => [o.period, o.value, out.displayUnit, out.series.nameTr, out.sourceOrg, out.verifyUrl]),
  );
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="${req.params.id}.csv"`);
  return res.send('﻿' + csv);
});

api.get('/export/compare.csv', (req, res) => {
  const ids = (typeof req.query.ids === 'string' ? req.query.ids : '').split(',').map((s) => s.trim()).filter(Boolean);
  const parsed = rangeSchema.safeParse(req.query);
  const opts = parsed.success ? parsed.data : {};
  const resolved = ids.map((id) => resolveSeries(id, opts)).filter((s): s is NonNullable<typeof s> => s !== null);
  if (resolved.length === 0) return res.status(400).json({ error: 'Seri seçilmedi' });

  const periods = [...new Set(resolved.flatMap((s) => s.observations.map((o) => o.period)))].sort();
  const maps = resolved.map((s) => new Map(s.observations.map((o) => [o.period, o.value])));
  const csv = toCsv(
    ['donem', ...resolved.map((s) => `${s.series.nameTr} (${s.displayUnit})`)],
    periods.map((p) => [p, ...maps.map((m) => m.get(p) ?? null)]),
  );
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', 'attachment; filename="karsilastirma.csv"');
  return res.send('﻿' + csv);
});

// ── Yazma uçları ────────────────────────────────────────────────────────────

/** ADMIN_TOKEN tanımlıysa yazma uçlarını korur; tanımsızsa yerel kullanım varsayılır. */
function requireAdmin(req: Request, res: Response): boolean {
  if (!config.adminToken) return true;
  const header = req.headers['x-admin-token'];
  if (header === config.adminToken) return true;
  res.status(401).json({ error: 'Yetkisiz — X-Admin-Token başlığı gerekli' });
  return false;
}

api.post('/admin/refresh', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  if (isRefreshing()) return res.status(409).json({ error: 'Güncelleme zaten çalışıyor' });
  const only = typeof req.body?.only === 'string' ? [req.body.only] : undefined;
  if (only) {
    const r = await ingestSeries(only[0]!);
    return res.json({ results: [r] });
  }
  void refreshNow();
  return res.json({ started: true });
});

const manualSchema = z.object({
  seriesId: z.string().min(1),
  period: z.string().min(4),
  value: z.union([z.number(), z.string()]),
  sourceRef: z.string().min(1, 'Kaynak referansı zorunludur'),
  note: z.string().optional(),
});

/** Tek değer girişi. Kaynak referansı zorunludur — izsiz veri kabul edilmez. */
api.post('/admin/manual', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const parsed = manualSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: 'Geçersiz giriş', detail: parsed.error.flatten() });

  const series = getSeries(parsed.data.seriesId);
  if (!series) return res.status(404).json({ error: 'Seri bulunamadı' });
  if (!EDITABLE.has(series.connector)) {
    return res.status(400).json({ error: `"${series.nameTr}" kaynağından otomatik güncellenir; elle giriş kabul etmez` });
  }

  const period = normalizePeriod(parsed.data.period, series.freq);
  const value = parseNumber(parsed.data.value);
  if (!period) return res.status(400).json({ error: 'Dönem okunamadı (YYYY-MM-DD bekleniyor)' });
  if (value === null) return res.status(400).json({ error: 'Değer sayı değil' });

  db().prepare(
    'INSERT INTO manual_entries (series_id, period, value, source_ref, note) VALUES (?, ?, ?, ?, ?)',
  ).run(series.id, period, value, parsed.data.sourceRef, parsed.data.note ?? null);
  upsertObservations(series.id, [{ period, value }]);
  invalidateFxCache();
  return res.json({ ok: true, period, value });
});

/** CSV toplu içe aktarım: donem,deger[,kaynak][,not] */
api.post('/admin/import', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const seriesId = String(req.body?.seriesId ?? '');
  const csv = String(req.body?.csv ?? '');
  const defaultRef = String(req.body?.sourceRef ?? '').trim();

  const series = getSeries(seriesId);
  if (!series) return res.status(404).json({ error: 'Seri bulunamadı' });
  if (!EDITABLE.has(series.connector)) {
    return res.status(400).json({ error: `"${series.nameTr}" kaynağından otomatik güncellenir; CSV içe aktarım yalnızca elle yönetilen seriler içindir` });
  }
  if (!csv.trim()) return res.status(400).json({ error: 'CSV boş' });

  const rows = parseCsvObjects(csv);
  if (rows.length === 0) return res.status(400).json({ error: 'CSV ayrıştırılamadı — başlık satırı "donem,deger" içermeli' });

  const errors: string[] = [];
  const accepted: { period: string; value: number; ref: string; note: string | null }[] = [];

  rows.forEach((r, i) => {
    const period = normalizePeriod(r['donem'] ?? r['date'] ?? r['tarih'] ?? '', series.freq);
    const value = parseNumber(r['deger'] ?? r['value'] ?? r['fiyat'] ?? null);
    const ref = (r['kaynak'] ?? r['source'] ?? defaultRef).trim();
    if (!period) { errors.push(`Satır ${i + 2}: dönem okunamadı`); return; }
    if (value === null) { errors.push(`Satır ${i + 2}: değer sayı değil`); return; }
    if (!ref) { errors.push(`Satır ${i + 2}: kaynak referansı yok (CSV'ye "kaynak" sütunu ekleyin ya da form alanını doldurun)`); return; }
    accepted.push({ period, value, ref, note: r['not'] || null });
  });

  if (accepted.length === 0) {
    return res.status(400).json({ error: 'Hiçbir satır kabul edilmedi', errors: errors.slice(0, 20) });
  }

  const insert = db().prepare('INSERT INTO manual_entries (series_id, period, value, source_ref, note) VALUES (?, ?, ?, ?, ?)');
  db().transaction(() => {
    for (const a of accepted) insert.run(series.id, a.period, a.value, a.ref, a.note);
  })();
  upsertObservations(series.id, accepted.map((a) => ({ period: a.period, value: a.value })));
  invalidateFxCache();

  return res.json({ ok: true, imported: accepted.length, skipped: errors.length, errors: errors.slice(0, 20) });
});

/** Kur tablosunun kapsamı — para birimi çevriminin güvenilirliğini göstermek için. */
api.get('/fx', (_req, res) => {
  const fx = fxTable();
  res.json({
    usdTry: { count: fx.usdTry.length, first: fx.usdTry[0]?.period ?? null, last: fx.usdTry.at(-1) ?? null },
    eurTry: { count: fx.eurTry.length, first: fx.eurTry[0]?.period ?? null, last: fx.eurTry.at(-1) ?? null },
  });
});

api.post('/admin/ingest-missing', async (req, res) => {
  if (!requireAdmin(req, res)) return;
  const results = await ingestAll({ onlyMissing: true });
  return res.json({ results });
});
