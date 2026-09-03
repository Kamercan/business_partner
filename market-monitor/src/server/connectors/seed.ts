import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseCsvObjects } from '../lib/csv.js';
import { normalizePeriod, parseNumber } from '../lib/period.js';
import { dedupe, type Connector } from './types.js';
import { db } from '../db/index.js';

const here = dirname(fileURLToPath(import.meta.url));

/** Tohum dosyalarının aranacağı yerler (geliştirme ve derlenmiş çalışma). */
const SEED_DIRS = [
  join(here, '../../../seed'),
  join(here, '../../seed'),
  join(process.cwd(), 'seed'),
];

export function seedDir(): string {
  const dir = SEED_DIRS.find((d) => existsSync(d));
  if (!dir) throw new Error('seed/ dizini bulunamadı');
  return dir;
}

/**
 * Depoyla birlikte gelen tarihsel CSV dosyaları.
 *
 * Bir kamu API'sinin bulunmadığı ama değeri resmî bir belgede tek tek ilan
 * edilen seriler için kullanılır — asgari ücret gibi. Her satır `kaynak`
 * sütununda kendi Resmî Gazete / karar referansını taşır; bu referanslar
 * Kaynaklar sayfasında gözlemle birlikte gösterilir.
 *
 * Beklenen sütunlar: donem,deger,kaynak[,not]
 */
export const seed: Connector = {
  id: 'seed',
  async fetch(series) {
    const file = String(series.params.file);
    const path = join(seedDir(), file);
    if (!existsSync(path)) throw new Error(`Tohum dosyası bulunamadı: seed/${file}`);

    const rows = parseCsvObjects(readFileSync(path, 'utf8'));
    const obs = rows.flatMap((r) => {
      const period = normalizePeriod(r['donem'] ?? '', series.freq);
      const value = parseNumber(r['deger'] ?? null);
      return period && value !== null ? [{ period, value }] : [];
    });
    if (obs.length === 0) throw new Error(`seed/${file} içinde geçerli satır yok`);

    // Yeni bir resmî karar çıktığında depoyu değiştirmek gerekmesin: arayüzden
    // girilen değerler tohum dosyasının üzerine yazılır ve onu ileriye taşır.
    const entered = db()
      .prepare<[string, string], { period: string; value: number }>(
        `SELECT period, value FROM manual_entries
          WHERE series_id = ?
            AND id IN (SELECT MAX(id) FROM manual_entries WHERE series_id = ? GROUP BY period)`,
      )
      .all(series.id, series.id);

    return dedupe([...obs, ...entered]);
  },
};

/** Tohum dosyasındaki kaynak referanslarını dönem bazında döndürür. */
export function seedReferences(file: string): Record<string, { source: string; note?: string }> {
  const path = join(seedDir(), file);
  if (!existsSync(path)) return {};
  const out: Record<string, { source: string; note?: string }> = {};
  for (const r of parseCsvObjects(readFileSync(path, 'utf8'))) {
    const period = normalizePeriod(r['donem'] ?? '', 'annual');
    if (period && r['kaynak']) out[period] = { source: r['kaynak'], note: r['not'] || undefined };
  }
  return out;
}
