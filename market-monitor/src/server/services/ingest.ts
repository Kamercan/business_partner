import { connectorFor } from '../connectors/index.js';
import { envKey } from '../config.js';
import { SOURCE_BY_ID } from '../catalog/sources.js';
import {
  finishRun, getSeries, listSeries, observationCount, setConfidence, setSetting, startRun, upsertObservations,
} from './store.js';
import type { SeriesDef } from '../../shared/types.js';

export interface IngestResult {
  seriesId: string;
  status: 'ok' | 'error' | 'skipped';
  rows: number;
  message?: string;
}

/** Bir serinin kaynağı için gereken anahtar tanımlı mı. */
export function keyStatus(series: SeriesDef): { key: string | null; envVar: string | null; usable: boolean } {
  const connector = connectorFor(series.connector);
  const source = SOURCE_BY_ID.get(series.sourceId);
  const envVar = connector.requiresEnv ?? source?.envVar ?? null;
  const key = envKey(envVar ?? undefined);
  const usable = !envVar || key !== null || connector.worksWithoutKey === true;
  return { key, envVar, usable };
}

/**
 * Tek bir seriyi kaynağından çeker ve yazar.
 *
 * Manuel seriler dışarı istek atmaz; anahtarı olmayan seriler hata değil
 * "skipped" sayılır — böylece eksik yapılandırma, gerçek bir kaynak arızasıyla
 * karışmaz ve pano yanlış alarm vermez.
 */
export async function ingestSeries(seriesId: string, opts: { since?: string } = {}): Promise<IngestResult> {
  const series = getSeries(seriesId);
  if (!series) return { seriesId, status: 'error', rows: 0, message: 'Seri bulunamadı' };

  const { key, envVar, usable } = keyStatus(series);
  if (!usable) {
    const source = SOURCE_BY_ID.get(series.sourceId);
    const msg = `${envVar} tanımlı değil${source?.signupUrl ? ` — ücretsiz anahtar: ${source.signupUrl}` : ''}`;
    const runId = startRun(seriesId);
    finishRun(runId, 'skipped', 0, msg);
    return { seriesId, status: 'skipped', rows: 0, message: msg };
  }

  const runId = startRun(seriesId);
  try {
    const connector = connectorFor(series.connector);
    const obs = await connector.fetch(series, { since: opts.since, apiKey: key });

    if (obs.length === 0) {
      // Manuel serilerde veri yokluğu arıza değil, henüz girilmemiş demektir.
      const msg = series.connector === 'manual'
        ? 'Henüz veri girilmemiş — Veri Girişi sayfasından CSV yükleyin'
        : 'Kaynak veri döndürmedi';
      finishRun(runId, series.connector === 'manual' ? 'skipped' : 'error', 0, msg);
      return { seriesId, status: series.connector === 'manual' ? 'skipped' : 'error', rows: 0, message: msg };
    }

    const rows = upsertObservations(seriesId, obs);
    // Canlı veri geldi: kod artık doğrulanmış sayılır.
    if (series.connector !== 'manual' && series.connector !== 'seed') setConfidence(seriesId, 'verified');
    finishRun(runId, 'ok', rows, `${rows} gözlem · son dönem ${obs[obs.length - 1]!.period}`);
    return { seriesId, status: 'ok', rows };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    finishRun(runId, 'error', 0, message.slice(0, 500));
    return { seriesId, status: 'error', rows: 0, message };
  }
}

/**
 * Tüm serileri çeker. Kaynakları yormamak için sınırlı eşzamanlılıkla çalışır.
 */
export async function ingestAll(opts: {
  since?: string;
  only?: string[];
  concurrency?: number;
  onlyMissing?: boolean;
  onProgress?: (r: IngestResult, done: number, total: number) => void;
} = {}): Promise<IngestResult[]> {
  let targets = listSeries();
  if (opts.only?.length) targets = targets.filter((s) => opts.only!.includes(s.id));
  if (opts.onlyMissing) targets = targets.filter((s) => observationCount(s.id) === 0);

  const results: IngestResult[] = [];
  const limit = Math.max(1, opts.concurrency ?? 4);
  let cursor = 0;

  const worker = async () => {
    while (cursor < targets.length) {
      const series = targets[cursor++];
      if (!series) break;
      const r = await ingestSeries(series.id, { since: opts.since });
      results.push(r);
      opts.onProgress?.(r, results.length, targets.length);
    }
  };

  await Promise.all(Array.from({ length: Math.min(limit, targets.length) }, worker));
  setSetting('last_ingest_at', new Date().toISOString());
  return results;
}
