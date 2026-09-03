import { getText } from '../lib/http.js';
import { parseCsvObjects } from '../lib/csv.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';

/**
 * Yapılandırılabilir CSV bağlayıcısı — kaçış kapısı.
 *
 * Aboneliğiniz olan bir servis (Freightos API, MEPS dışa aktarımı, kurum içi
 * ERP raporu) düzenli bir CSV/URL veriyorsa, seriyi kod yazmadan buraya
 * bağlayabilirsiniz. Parametreler:
 *   url          — mutlak adres; {{TODAY}} ve {{SINCE}} yer tutucuları desteklenir
 *   dateColumn   — tarih sütunu adı
 *   valueColumn  — değer sütunu adı
 *   delimiter    — varsayılan ","
 *   header       — "Ad: Değer" biçiminde ek istek başlığı (ör. API anahtarı)
 */
export const csvUrl: Connector = {
  id: 'csvurl',
  async fetch(series, ctx) {
    const raw = String(series.params.url ?? '');
    if (!raw) throw new Error('csvurl bağlayıcısı için "url" parametresi gerekli');

    const url = raw
      .replace('{{TODAY}}', new Date().toISOString().slice(0, 10))
      .replace('{{SINCE}}', ctx.since ?? '2015-01-01');

    const headers: Record<string, string> = {};
    const headerParam = String(series.params.header ?? '');
    if (headerParam) {
      const idx = headerParam.indexOf(':');
      if (idx > 0) headers[headerParam.slice(0, idx).trim()] = headerParam.slice(idx + 1).trim();
    }

    const rows = parseCsvObjects(await getText(url, { headers, accept: 'text/csv,*/*' }),
      String(series.params.delimiter ?? ','));
    if (rows.length === 0) throw new Error('CSV boş döndü');

    const dateCol = String(series.params.dateColumn ?? 'date');
    const valueCol = String(series.params.valueColumn ?? 'value');
    const first = rows[0]!;
    if (!(dateCol in first) || !(valueCol in first)) {
      throw new Error(`CSV sütunları uyuşmuyor. Bulunan: ${Object.keys(first).join(', ')}`);
    }

    const obs = rows.flatMap((r) => {
      const period = normalizePeriod(r[dateCol] ?? '', series.freq);
      const value = parseNumber(r[valueCol] ?? null);
      return period && value !== null ? [{ period, value }] : [];
    });
    if (obs.length === 0) throw new Error('CSV içinde ayrıştırılabilir satır yok');
    return dedupe(obs);
  },
};
