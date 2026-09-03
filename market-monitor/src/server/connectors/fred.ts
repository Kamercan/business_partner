import { getJson, getText } from '../lib/http.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

/**
 * FRED (St. Louis Fed) — BLS, EIA ve IMF serilerinin aynası.
 *
 * İki yol vardır ve bu bağlayıcı ikisini de destekler:
 *   1. FRED_API_KEY tanımlıysa resmî JSON API (yüksek limit, meta veri).
 *   2. Anahtar yoksa kamuya açık grafik CSV uç noktası — anahtarsız çalışır,
 *      böylece uygulama sıfır yapılandırmayla da veri gösterebilir.
 */
export const fred: Connector = {
  id: 'fred',
  requiresEnv: 'FRED_API_KEY',
  worksWithoutKey: true,
  async fetch(series, ctx) {
    const id = String(series.params.seriesId);
    const since = ctx.since ?? '1990-01-01';

    if (ctx.apiKey) {
      const url =
        `https://api.stlouisfed.org/fred/series/observations?series_id=${encodeURIComponent(id)}` +
        `&api_key=${encodeURIComponent(ctx.apiKey)}&file_type=json&observation_start=${since}`;
      const body = await getJson<{ observations?: { date: string; value: string }[]; error_message?: string }>(url);
      if (body.error_message) throw new Error(`FRED: ${body.error_message}`);
      const rows = body.observations ?? [];
      if (rows.length === 0) throw new Error(`FRED "${id}" için gözlem döndürmedi — seri kodunu doğrulayın`);
      return dedupe(
        rows.flatMap((r) => {
          const period = normalizePeriod(r.date, series.freq);
          const value = parseNumber(r.value); // eksik gözlemler "." gelir
          return period && value !== null ? [{ period, value }] : [];
        }),
      );
    }

    // Anahtarsız CSV yolu.
    const csv = await getText(
      `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(id)}&cosd=${since}`,
      { accept: 'text/csv' },
    );
    return dedupe(parseFredCsv(csv, series.freq));
  },
};

function parseFredCsv(csv: string, freq: Parameters<typeof normalizePeriod>[1]) {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) throw new Error('FRED CSV boş döndü — seri kodu geçersiz olabilir');
  return lines.slice(1).flatMap((line) => {
    const [date, raw] = line.split(',');
    if (!date) return [];
    const period = normalizePeriod(date, freq);
    const value = parseNumber(raw ?? null);
    return period && value !== null ? [{ period, value }] : [];
  });
}
