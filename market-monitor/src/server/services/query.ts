import { getObservations, getSeries, listSeries, allLastRuns, listSources } from './store.js';
import { applyTransform, convertCurrency, displayUnit, summarize, type FxTable } from './transform.js';
import { keyStatus } from './ingest.js';
import { SOURCE_BY_ID } from '../catalog/sources.js';
import type { Frequency, Observation, SeriesDef, Transform } from '../../shared/types.js';

/** Serinin "bayat" sayılacağı gecikme eşiği (gün). */
const STALE_DAYS: Record<Frequency, number> = {
  daily: 10, weekly: 21, monthly: 70, quarterly: 200, semiannual: 400, annual: 800,
};

export function isStale(freq: Frequency, lastPeriod: string | null): boolean {
  if (!lastPeriod) return true;
  const ageDays = (Date.now() - Date.parse(lastPeriod)) / 86_400_000;
  return ageDays > STALE_DAYS[freq];
}

let fxCache: { table: FxTable; at: number } | null = null;

/** Kur tablosunu yükler (60 saniye önbellekli). */
export function fxTable(): FxTable {
  if (fxCache && Date.now() - fxCache.at < 60_000) return fxCache.table;
  const table: FxTable = {
    usdTry: getObservations('fx.usdtry'),
    eurTry: getObservations('fx.eurtry'),
  };
  fxCache = { table, at: Date.now() };
  return table;
}

export function invalidateFxCache(): void { fxCache = null; }

export interface SeriesMeta {
  series: SeriesDef;
  sourceOrg: string;
  sourceName: string;
  sourceTier: string;
  /** Veriyi üreten kurum — kanaldan farklıysa dolu, aynıysa null. */
  producerOrg: string | null;
  count: number;
  firstPeriod: string | null;
  lastPeriod: string | null;
  lastValue: number | null;
  stale: boolean;
  lastRunStatus: string | null;
  lastRunAt: string | null;
  lastRunMessage: string | null;
  keyMissing: boolean;
  keyEnvVar: string | null;
}

/** Katalog listesi — her seri için kapsam, tazelik ve kaynak durumu. */
export function seriesMeta(filter: { category?: string; featured?: boolean } = {}): SeriesMeta[] {
  const runs = allLastRuns();
  return listSeries(filter).map((series) => {
    const obs = getObservations(series.id);
    const last = obs.at(-1) ?? null;
    const run = runs.get(series.id) ?? null;
    const ks = keyStatus(series);
    const source = SOURCE_BY_ID.get(series.sourceId);
    const producer = series.producerSourceId ? SOURCE_BY_ID.get(series.producerSourceId) : null;
    return {
      series,
      sourceOrg: source?.org ?? series.sourceId,
      sourceName: source?.name ?? series.sourceId,
      sourceTier: source?.tier ?? 'official',
      producerOrg: producer?.org ?? null,
      count: obs.length,
      firstPeriod: obs[0]?.period ?? null,
      lastPeriod: last?.period ?? null,
      lastValue: last?.value ?? null,
      stale: isStale(series.freq, last?.period ?? null),
      lastRunStatus: run?.status ?? null,
      lastRunAt: run?.finishedAt ?? run?.startedAt ?? null,
      lastRunMessage: run?.message ?? null,
      keyMissing: !ks.usable,
      keyEnvVar: ks.envVar,
    };
  });
}

export interface ResolvedSeries {
  series: SeriesDef;
  observations: Observation[];
  displayUnit: string;
  currency: string | null;
  /** Para birimi çevrimi istendi ama yapılamadıysa nedeni. */
  currencyWarning?: string;
  summary: ReturnType<typeof summarize>;
  /** Erişim kanalı. */
  sourceOrg: string;
  /** Veriyi üreten kurum, kanaldan farklıysa. */
  producerOrg: string | null;
  verifyUrl: string;
  confidence: string;
  stale: boolean;
}

export interface ResolveOptions {
  from?: string;
  to?: string;
  transform?: Transform;
  /** Hedef para birimi (TRY/USD/EUR). Parasal olmayan seriler etkilenmez. */
  currency?: string;
}

/**
 * Bir seriyi görüntülemeye hazır hale getirir: aralık filtresi → para birimi
 * çevrimi → dönüşüm. Sıra önemlidir; endeksleme ve yıllık değişim, çevrilmiş
 * değerler üzerinden hesaplanır ki kur etkisi grafikte görünsün.
 */
export function resolveSeries(id: string, opts: ResolveOptions = {}): ResolvedSeries | null {
  const series = getSeries(id);
  if (!series) return null;

  let observations = getObservations(id, opts.from, opts.to);
  let currency = series.currency;
  let currencyWarning: string | undefined;

  if (opts.currency && series.currency && opts.currency !== series.currency) {
    const res = convertCurrency(observations, series.currency, opts.currency, fxTable());
    if (res.ok) {
      observations = res.observations;
      currency = opts.currency;
    } else {
      currencyWarning = `${opts.currency} çevrimi yapılamadı: ${res.reason}. Değerler ${series.currency} olarak gösteriliyor.`;
    }
  }

  const transform = opts.transform ?? 'raw';
  const transformed = applyTransform(observations, transform, series.freq);
  const source = SOURCE_BY_ID.get(series.sourceId);

  return {
    series,
    observations: transformed,
    displayUnit: transform === 'raw' && currency && series.currency && currency !== series.currency
      ? series.unit.replace(series.currency, currency)
      : displayUnit(series.unit, transform),
    currency,
    currencyWarning,
    summary: summarize(transformed, series.freq),
    sourceOrg: source?.org ?? series.sourceId,
    producerOrg: series.producerSourceId
      ? SOURCE_BY_ID.get(series.producerSourceId)?.org ?? null
      : null,
    verifyUrl: series.verifyUrl,
    confidence: series.confidence,
    stale: isStale(series.freq, getObservations(id).at(-1)?.period ?? null),
  };
}

/** Kaynak bazlı sağlık özeti — Kaynaklar sayfası için. */
export function sourceHealth() {
  const metas = seriesMeta();
  return listSources().map((source) => {
    const own = metas.filter((m) => m.series.sourceId === source.id);
    // Bu kurum veriyi üretiyor ama erişim başka bir kanaldan sağlanıyorsa,
    // gösterge yine bu kurumun sayfasında görünmelidir — kullanıcı "bu veriyi
    // kim üretiyor" sorusunun cevabını burada arar.
    const producedElsewhere = metas.filter(
      (m) => m.series.producerSourceId === source.id && m.series.sourceId !== source.id,
    );
    return {
      source,
      producedElsewhere,
      seriesCount: own.length,
      okCount: own.filter((m) => m.lastRunStatus === 'ok').length,
      errorCount: own.filter((m) => m.lastRunStatus === 'error').length,
      skippedCount: own.filter((m) => m.lastRunStatus === 'skipped').length,
      staleCount: own.filter((m) => m.stale).length,
      keyMissing: own.some((m) => m.keyMissing),
      series: own,
    };
  });
}
