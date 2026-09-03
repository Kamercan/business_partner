import { getText } from '../lib/http.js';
import { parseCsvObjects } from '../lib/csv.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';
import type { Observation } from '../../shared/types.js';

/**
 * TCMB gösterge kurları.
 *
 * TCMB'nin XML servisi gün başına tek dosya verdiği için uzun geçmişi oradan
 * çekmek binlerce istek anlamına gelir. Bu yüzden:
 *   • Geçmiş, tek istekle ECB Data Portal'dan alınır (EUR/TRY doğrudan;
 *     USD/TRY, EUR/TRY ÷ EUR/USD ile türetilir).
 *   • Bugünün resmî değeri ayrıca TCMB'nin kendi XML'inden alınır ve üzerine
 *     yazılır — böylece güncel gün her zaman TCMB gösterge kurudur.
 * Her iki kaynak da anahtarsızdır.
 */
export const tcmbKur: Connector = {
  id: 'tcmb_kur',
  async fetch(series, ctx) {
    const cur = String(series.params.currency ?? 'USD').toUpperCase();
    const since = ctx.since ?? '2010-01-01';

    const eurTry = await ecbSeries('TRY', since);
    let obs: Observation[];

    if (cur === 'EUR') {
      obs = eurTry;
    } else if (cur === 'USD') {
      const eurUsd = new Map((await ecbSeries('USD', since)).map((o) => [o.period, o.value]));
      obs = eurTry.flatMap((o) => {
        const usd = eurUsd.get(o.period);
        return usd && usd !== 0 ? [{ period: o.period, value: o.value / usd }] : [];
      });
    } else {
      throw new Error(`Desteklenmeyen para birimi: ${cur}`);
    }

    // Bugünün TCMB gösterge kuru — resmî değer bu.
    const today = await tcmbToday(cur).catch(() => null);
    if (today) obs = [...obs, today];

    if (obs.length === 0) throw new Error('Kur verisi alınamadı');
    return dedupe(obs);
  },
};

/** ECB Data Portal: 1 EUR = ? {quote}, günlük. */
async function ecbSeries(quote: string, since: string): Promise<Observation[]> {
  const url =
    `https://data-api.ecb.europa.eu/service/data/EXR/D.${quote}.EUR.SP00.A` +
    `?format=csvdata&startPeriod=${since}&detail=dataonly`;
  const rows = parseCsvObjects(await getText(url, { accept: 'text/csv' }));
  return rows.flatMap((r) => {
    const period = normalizePeriod(r['TIME_PERIOD'] ?? '', 'daily');
    const value = parseNumber(r['OBS_VALUE'] ?? null);
    return period && value !== null ? [{ period, value }] : [];
  });
}

/** TCMB günlük XML'inden bugünün döviz alış kuru. */
async function tcmbToday(currency: string): Promise<Observation | null> {
  const xml = await getText('https://www.tcmb.gov.tr/kurlar/today.xml', { accept: 'application/xml' });
  const dateMatch = /Tarih="(\d{2})\.(\d{2})\.(\d{4})"/.exec(xml);
  if (!dateMatch) return null;
  const period = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;

  const block = new RegExp(`<Currency[^>]*CurrencyCode="${currency}"[^>]*>([\\s\\S]*?)</Currency>`).exec(xml);
  if (!block?.[1]) return null;
  const rate = /<ForexBuying>([\d.]+)<\/ForexBuying>/.exec(block[1]);
  const value = parseNumber(rate?.[1] ?? null);
  return value === null ? null : { period, value };
}
