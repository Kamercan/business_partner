import { getJson } from '../lib/http.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

type WbRow = { date: string; value: number | null };

/**
 * Dünya Bankası Açık Veri API'si — anahtar gerektirmez.
 * https://api.worldbank.org/v2/country/{ISO3}/indicator/{KOD}?format=json
 */
export const worldbank: Connector = {
  id: 'worldbank',
  async fetch(series) {
    const country = String(series.params.country ?? 'TUR');
    const indicator = String(series.params.indicator);
    const url = `https://api.worldbank.org/v2/country/${encodeURIComponent(country)}/indicator/${encodeURIComponent(indicator)}?format=json&per_page=20000`;

    const body = await getJson<unknown>(url);
    if (!Array.isArray(body) || body.length < 2) {
      const msg = Array.isArray(body) && body[0] && typeof body[0] === 'object'
        ? JSON.stringify(body[0]).slice(0, 200) : 'beklenmeyen yanıt';
      throw new Error(`Dünya Bankası yanıtı okunamadı: ${msg}`);
    }
    const rows = (body[1] ?? []) as WbRow[];
    return dedupe(
      rows.flatMap((r) => {
        const period = normalizePeriod(r.date, series.freq);
        const value = parseNumber(r.value);
        return period && value !== null ? [{ period, value }] : [];
      }),
    );
  },
};
