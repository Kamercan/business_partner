import { getJson } from '../lib/http.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

/**
 * EIA Open Data v2 — ücretsiz anahtar gerekir.
 * https://api.eia.gov/v2/{rota}/data/?api_key=...&frequency=...&data[0]=value&facets[...]
 */
export const eia: Connector = {
  id: 'eia',
  requiresEnv: 'EIA_API_KEY',
  async fetch(series, ctx) {
    if (!ctx.apiKey) throw new Error('EIA_API_KEY tanımlı değil — https://www.eia.gov/opendata/register.php');
    const route = String(series.params.route);
    const facets = String(series.params.facets ?? '');
    const frequency = String(series.params.frequency ?? 'monthly');

    const url =
      `https://api.eia.gov/v2/${route}/data/?api_key=${encodeURIComponent(ctx.apiKey)}` +
      `&frequency=${encodeURIComponent(frequency)}&data[0]=value&sort[0][column]=period&sort[0][direction]=asc&length=5000` +
      (facets ? `&${facets}` : '') +
      (ctx.since ? `&start=${ctx.since.slice(0, frequency === 'annual' ? 4 : frequency === 'daily' ? 10 : 7)}` : '');

    const body = await getJson<{ response?: { data?: { period: string; value: number | string }[] }; error?: string }>(url);
    if (body.error) throw new Error(`EIA: ${body.error}`);
    const rows = body.response?.data ?? [];
    if (rows.length === 0) throw new Error('EIA sorgusu veri döndürmedi — rota veya facet filtresini doğrulayın');

    return dedupe(
      rows.flatMap((r) => {
        const period = normalizePeriod(r.period, series.freq);
        const value = parseNumber(r.value);
        return period && value !== null ? [{ period, value }] : [];
      }),
    );
  },
};
