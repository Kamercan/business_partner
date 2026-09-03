import { getJson } from '../lib/http.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

/**
 * IMF DataMapper (Dünya Ekonomik Görünümü) — anahtar gerektirmez.
 * https://www.imf.org/external/datamapper/api/v1/{GÖSTERGE}/{ISO3}
 * Yanıt: { values: { PCPIPCH: { TUR: { "1980": 110.2, ... } } } }
 */
export const imf: Connector = {
  id: 'imf',
  async fetch(series) {
    const indicator = String(series.params.indicator);
    const country = String(series.params.country);
    const url = `https://www.imf.org/external/datamapper/api/v1/${encodeURIComponent(indicator)}/${encodeURIComponent(country)}`;

    const body = await getJson<{ values?: Record<string, Record<string, Record<string, number>>> }>(url);
    const byYear = body.values?.[indicator]?.[country];
    if (!byYear) throw new Error(`IMF yanıtında ${indicator}/${country} bulunamadı`);

    return dedupe(
      Object.entries(byYear).flatMap(([year, raw]) => {
        const period = normalizePeriod(year, series.freq);
        const value = parseNumber(raw);
        return period && value !== null ? [{ period, value }] : [];
      }),
    );
  },
};
