import { getJson } from '../lib/http.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

/** JSON-stat 2.0 gövdesinin ihtiyacımız olan kısmı. */
interface JsonStat {
  value: Record<string, number | null> | (number | null)[];
  size: number[];
  id: string[];
  dimension: Record<string, { category: { index: Record<string, number> | string[] } }>;
  error?: unknown;
}

/**
 * Eurostat Dissemination API — anahtar gerektirmez, JSON-stat 2.0 döner.
 * https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{VERİ_KÜMESİ}?format=JSON&...
 *
 * Sorgu, seri tanımındaki `query` alanından gelir (ör. "currency=EUR&geo=TR").
 * Filtreler yeterince daraltıldığında geriye tek boyut (zaman) kalır; bu
 * bağlayıcı geriye kalan zaman ekseni üzerinden gözlemleri çıkarır.
 */
export const eurostat: Connector = {
  id: 'eurostat',
  async fetch(series) {
    const dataset = String(series.params.dataset);
    const query = String(series.params.query ?? '');
    const url =
      `https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${encodeURIComponent(dataset)}` +
      `?format=JSON&lang=EN${query ? `&${query}` : ''}`;

    const body = await getJson<JsonStat>(url);
    if (body.error) throw new Error(`Eurostat hatası: ${JSON.stringify(body.error).slice(0, 200)}`);
    if (!body.dimension || !body.id) throw new Error('Eurostat yanıtı JSON-stat biçiminde değil');

    const timeDim = body.id.find((d) => d === 'time') ?? body.id[body.id.length - 1];
    if (!timeDim) throw new Error('Eurostat yanıtında zaman boyutu yok');

    const timeIndex = body.dimension[timeDim]?.category.index;
    if (!timeIndex) throw new Error(`Eurostat yanıtında "${timeDim}" boyutu yok`);

    // index ya { "2024-01": 0, ... } ya da [ "2024-01", ... ] biçimindedir.
    const periods: string[] = Array.isArray(timeIndex)
      ? timeIndex
      : Object.entries(timeIndex).sort((a, b) => a[1] - b[1]).map(([k]) => k);

    // Zaman dışındaki boyutlar filtrelerle 1'e indiği için, düz dizideki konum
    // doğrudan zaman indeksine karşılık gelir.
    const timePos = body.id.indexOf(timeDim);
    const stride = body.size.slice(timePos + 1).reduce((a, b) => a * b, 1);
    const readAt = (i: number): number | null => {
      const raw = Array.isArray(body.value) ? body.value[i] : body.value[String(i)];
      return parseNumber(raw ?? null);
    };

    const obs = periods.flatMap((label, i) => {
      const period = normalizePeriod(label, series.freq);
      const value = readAt(i * stride);
      return period && value !== null ? [{ period, value }] : [];
    });

    if (obs.length === 0) {
      throw new Error(
        'Eurostat sorgusu veri döndürmedi — filtreler (geo/unit/tax/nrg_cons) veri kümesiyle uyuşmuyor olabilir. ' +
        `Doğrulama: https://ec.europa.eu/eurostat/databrowser/view/${dataset}/default/table`,
      );
    }
    return dedupe(obs);
  },
};
