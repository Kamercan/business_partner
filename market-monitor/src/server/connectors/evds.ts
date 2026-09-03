import { getJson } from '../lib/http.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

const DDMMYYYY = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
};

/**
 * TCMB EVDS — TÜİK ve TCMB serilerinin resmî makine okunur kanalı.
 *
 * Anahtar HTTP başlığında `key` olarak gönderilir. Yanıtta sütun adı, seri
 * kodundaki noktalar alt çizgiye çevrilerek oluşur (TP.FG.J0 → TP_FG_J0).
 */
export const evds: Connector = {
  id: 'evds',
  requiresEnv: 'EVDS_API_KEY',
  async fetch(series, ctx) {
    if (!ctx.apiKey) {
      throw new Error(
        'EVDS_API_KEY tanımlı değil. Ücretsiz anahtar: https://evds2.tcmb.gov.tr/index.php?/evds/login ' +
        '→ giriş yapın → Profil → API Anahtarı.',
      );
    }
    const code = String(series.params.code);
    const start = DDMMYYYY(ctx.since ?? '2003-01-01');
    const end = DDMMYYYY(new Date().toISOString().slice(0, 10));

    const url =
      `https://evds2.tcmb.gov.tr/service/evds/series=${encodeURIComponent(code)}` +
      `&startDate=${start}&endDate=${end}&type=json`;

    const body = await getJson<{ items?: Record<string, string | null>[]; totalCount?: number }>(url, {
      headers: { key: ctx.apiKey },
    });

    const items = body.items ?? [];
    if (items.length === 0) {
      throw new Error(
        `EVDS "${code}" için veri döndürmedi. Seri kodunu doğrulamak için: npm run evds:find -- "<anahtar kelime>"`,
      );
    }

    const column = code.replace(/[.-]/g, '_');
    const first = items[0]!;
    const valueKey = column in first
      ? column
      : Object.keys(first).find((k) => k !== 'Tarih' && k !== 'UNIXTIME' && k !== 'YEARWEEK');
    if (!valueKey) throw new Error(`EVDS yanıtında "${code}" sütunu bulunamadı`);

    return dedupe(
      items.flatMap((row) => {
        const period = normalizePeriod(String(row['Tarih'] ?? ''), series.freq);
        const value = parseNumber(row[valueKey] ?? null);
        return period && value !== null ? [{ period, value }] : [];
      }),
    );
  },
};
