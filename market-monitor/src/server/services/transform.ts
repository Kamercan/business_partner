import type { Frequency, Observation, Transform } from '../../shared/types.js';

/** Bir tarihe ay ekler/çıkarır; ay sonu taşmalarını ayın son gününe kırpar. */
function shiftMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split('-').map(Number) as [number, number, number];
  const total = (y * 12 + (m - 1)) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(ny, nm, 0)).getUTCDate();
  const nd = Math.min(d, lastDay);
  return `${ny}-${String(nm).padStart(2, '0')}-${String(nd).padStart(2, '0')}`;
}

/**
 * Bir yıl öncesine karşılık gelen gözlemi bulur.
 *
 * Aylık/çeyreklik/altı aylık/yıllık serilerde dönem aritmetiği kesindir.
 * Günlük ve haftalık serilerde tam bir yıl önce gözlem olmayabilir (hafta sonu,
 * tatil); bu durumda bir yıl öncesine EN YAKIN ve ondan ÖNCEKİ gözlem alınır ve
 * 45 günden uzak sapmalar reddedilir — böylece boşluklar uydurma değişim
 * oranları üretmez.
 */
function findYearAgo(obs: Observation[], i: number, freq: Frequency): number | null {
  const target = shiftMonths(obs[i]!.period, -12);

  if (freq === 'monthly' || freq === 'quarterly' || freq === 'semiannual' || freq === 'annual') {
    for (let j = i - 1; j >= 0; j -= 1) {
      if (obs[j]!.period === target) return obs[j]!.value;
      if (obs[j]!.period < target) return null;
    }
    return null;
  }

  let best: Observation | null = null;
  for (let j = i - 1; j >= 0; j -= 1) {
    if (obs[j]!.period <= target) { best = obs[j]!; break; }
  }
  if (!best) return null;
  const gapDays = (Date.parse(target) - Date.parse(best.period)) / 86_400_000;
  return gapDays <= 45 ? best.value : null;
}

/** Serinin dönüşüm sonrası birimi. */
export function displayUnit(unit: string, transform: Transform): string {
  switch (transform) {
    case 'yoy': return '% (yıllık)';
    case 'mom': return '% (önceki döneme göre)';
    case 'index': return 'endeks (başlangıç = 100)';
    case 'cumulative': return '% (birikimli)';
    case 'raw': return unit;
  }
}

/** Seçilen dönüşümü uygular. Hesaplanamayan noktalar sonuçtan düşer. */
export function applyTransform(obs: Observation[], transform: Transform, freq: Frequency): Observation[] {
  if (obs.length === 0 || transform === 'raw') return obs;

  if (transform === 'yoy') {
    return obs.flatMap((o, i) => {
      const prev = findYearAgo(obs, i, freq);
      if (prev === null || prev === 0) return [];
      return [{ period: o.period, value: ((o.value - prev) / Math.abs(prev)) * 100 }];
    });
  }

  if (transform === 'mom') {
    return obs.slice(1).flatMap((o, i) => {
      const prev = obs[i]!.value;
      if (prev === 0) return [];
      return [{ period: o.period, value: ((o.value - prev) / Math.abs(prev)) * 100 }];
    });
  }

  const base = obs[0]!.value;
  if (base === 0) return [];
  if (transform === 'index') return obs.map((o) => ({ period: o.period, value: (o.value / base) * 100 }));
  return obs.map((o) => ({ period: o.period, value: ((o.value - base) / Math.abs(base)) * 100 }));
}

/**
 * Kur haritası: dönem → 1 birim yabancı para kaç TL.
 * Eksik günler için en son bilinen kur taşınır (ileri doldurma).
 */
export interface FxTable {
  usdTry: Observation[];
  eurTry: Observation[];
}

function rateAt(series: Observation[], period: string): number | null {
  if (series.length === 0) return null;
  let lo = 0;
  let hi = series.length - 1;
  let found: number | null = null;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (series[mid]!.period <= period) { found = series[mid]!.value; lo = mid + 1; } else { hi = mid - 1; }
  }
  // Seri hedef dönemden sonra başlıyorsa ilk bilinen kuru kullan.
  return found ?? series[0]!.value;
}

/**
 * Parasal bir seriyi hedef para birimine çevirir.
 * Çevrim TCMB gösterge kuru üzerinden yapılır; TRY ara para birimidir.
 */
export function convertCurrency(
  obs: Observation[],
  from: string,
  to: string,
  fx: FxTable,
): { observations: Observation[]; ok: boolean; reason?: string } {
  if (from === to) return { observations: obs, ok: true };

  const toTry = (value: number, cur: string, period: string): number | null => {
    if (cur === 'TRY') return value;
    const table = cur === 'USD' ? fx.usdTry : cur === 'EUR' ? fx.eurTry : null;
    if (!table) return null;
    const r = rateAt(table, period);
    return r === null ? null : value * r;
  };

  const fromTry = (valueTry: number, cur: string, period: string): number | null => {
    if (cur === 'TRY') return valueTry;
    const table = cur === 'USD' ? fx.usdTry : cur === 'EUR' ? fx.eurTry : null;
    if (!table) return null;
    const r = rateAt(table, period);
    return r === null || r === 0 ? null : valueTry / r;
  };

  const out: Observation[] = [];
  for (const o of obs) {
    const inTry = toTry(o.value, from, o.period);
    if (inTry === null) return { observations: obs, ok: false, reason: `${from} için kur verisi yok` };
    const converted = fromTry(inTry, to, o.period);
    if (converted === null) return { observations: obs, ok: false, reason: `${to} için kur verisi yok` };
    out.push({ period: o.period, value: converted });
  }
  return { observations: out, ok: true };
}

/** Son değer, önceki değer ve yıllık değişim — kart özetleri için. */
export function summarize(obs: Observation[], freq: Frequency): {
  last: Observation | null;
  prev: Observation | null;
  changePct: number | null;
  yoyPct: number | null;
} {
  if (obs.length === 0) return { last: null, prev: null, changePct: null, yoyPct: null };
  const last = obs[obs.length - 1]!;
  const prev = obs.length > 1 ? obs[obs.length - 2]! : null;
  const changePct = prev && prev.value !== 0 ? ((last.value - prev.value) / Math.abs(prev.value)) * 100 : null;
  const yearAgo = findYearAgo(obs, obs.length - 1, freq);
  const yoyPct = yearAgo !== null && yearAgo !== 0 ? ((last.value - yearAgo) / Math.abs(yearAgo)) * 100 : null;
  return { last, prev, changePct, yoyPct };
}
