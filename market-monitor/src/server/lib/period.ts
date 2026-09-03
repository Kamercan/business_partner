import type { Frequency } from '../../shared/types.js';

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * Kaynakların farklı dönem gösterimlerini tek biçime indirger: dönem BAŞLANGICI,
 * YYYY-MM-DD. Aylık, çeyreklik ve altı aylık seriler böylece günlük serilerle
 * aynı zaman ekseninde çizilebilir.
 *
 * Desteklenen girdiler: 2024 · 2024-05 · 2024M05 · 2024-05-13 · 2024Q2 ·
 * 2024-Q2 · 2024S1 · 2024-S1 · 13-05-2024 (EVDS) · 05-2024 (EVDS aylık)
 */
export function normalizePeriod(raw: string, freq: Frequency): string | null {
  const s = raw.trim();
  if (!s) return null;

  // 2024-05-13 / 2024-05 / 2024
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;

  m = /^(\d{4})-(\d{2})$/.exec(s);
  if (m) return `${m[1]}-${m[2]}-01`;

  // 2024M05 / 2024-M05
  m = /^(\d{4})-?M(\d{1,2})$/i.exec(s);
  if (m) return `${m[1]}-${pad(Number(m[2]))}-01`;

  // 2024Q2 / 2024-Q2
  m = /^(\d{4})-?Q([1-4])$/i.exec(s);
  if (m) return `${m[1]}-${pad((Number(m[2]) - 1) * 3 + 1)}-01`;

  // 2024S1 / 2024-S1  (Eurostat altı aylık)
  m = /^(\d{4})-?S([12])$/i.exec(s);
  if (m) return `${m[1]}-${m[2] === '1' ? '01' : '07'}-01`;

  // 2024W23 (ISO hafta) → haftanın pazartesisi
  m = /^(\d{4})-?W(\d{1,2})$/i.exec(s);
  if (m) return isoWeekStart(Number(m[1]), Number(m[2]));

  // EVDS: 13-05-2024 (günlük) ve 05-2024 (aylık)
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;

  m = /^(\d{2})-(\d{4})$/.exec(s);
  if (m) return `${m[2]}-${m[1]}-01`;

  // 2024
  m = /^(\d{4})$/.exec(s);
  if (m) return `${m[1]}-01-01`;

  // Son çare: Date ile ayrıştır
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  void freq;
  return null;
}

function isoWeekStart(year: number, week: number): string {
  const jan4 = Date.UTC(year, 0, 4);
  const dow = new Date(jan4).getUTCDay() || 7;
  const monday = jan4 - (dow - 1) * 86_400_000 + (week - 1) * 7 * 86_400_000;
  const d = new Date(monday);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Bir sıklıkta kaç dönem bir yıl eder — yıllık değişim hesabı için. */
export function periodsPerYear(freq: Frequency): number {
  switch (freq) {
    case 'daily': return 365;
    case 'weekly': return 52;
    case 'monthly': return 12;
    case 'quarterly': return 4;
    case 'semiannual': return 2;
    case 'annual': return 1;
  }
}

/** Sayısal gösterimleri ayrıştırır; virgüllü ondalık ve binlik ayracı dahil. */
export function parseNumber(raw: string | number | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
  const s = raw.trim();
  if (!s || s === '.' || s === '-' || s.toLowerCase() === 'null' || s === ':') return null;
  // "1.234,56" (TR) → 1234.56 ;  "1,234.56" (EN) → 1234.56
  const tr = /^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s);
  const cleaned = tr ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
