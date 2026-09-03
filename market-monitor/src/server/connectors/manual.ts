import { db } from '../db/index.js';
import { dedupe, type Connector } from './types.js';

/**
 * Elle veya CSV ile girilen seriler.
 *
 * Abonelikli piyasa değerlendirmeleri (Platts hurda, SteelOrbis HRC/CRC, FBX,
 * Drewry) ve API'si olmayan resmî bültenler (EPDK akaryakıt, BOTAŞ gaz) bu
 * kanaldan gelir. Bağlayıcı dışarıya istek atmaz; `manual_entries` tablosunu
 * okur ve her değerin kaynak referansı orada saklıdır.
 */
export const manual: Connector = {
  id: 'manual',
  async fetch(series) {
    const rows = db()
      .prepare<[string, string], { period: string; value: number }>(
        `SELECT period, value FROM manual_entries
          WHERE series_id = ?
            AND id IN (SELECT MAX(id) FROM manual_entries WHERE series_id = ? GROUP BY period)
          ORDER BY period`,
      )
      .all(series.id, series.id);
    return dedupe(rows);
  },
};
