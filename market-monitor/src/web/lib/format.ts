const tr = 'tr-TR';

/** Büyüklüğe göre ondalık basamak seçer — 0,42 ile 26.005,50 aynı kuralla okunmaz. */
export function formatValue(v: number | null | undefined, unit?: string): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  if (v === 0) return '0';
  const abs = Math.abs(v);
  const digits = unit?.startsWith('%') ? 1 : abs >= 1000 ? 0 : abs >= 100 ? 1 : abs >= 1 ? 2 : 4;
  return v.toLocaleString(tr, { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatPct(v: number | null | undefined): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  const sign = v > 0 ? '+' : '';
  return `${sign}${v.toLocaleString(tr, { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

const MONTHS = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];

/** Dönemi sıklığa uygun ayrıntıda yazar: yıllık "2024", aylık "May 2024", günlük "13 May 2024". */
export function formatPeriod(iso: string, freq?: string): string {
  const [y, m, d] = iso.split('-');
  if (!y) return iso;
  if (!m) return y;
  const month = MONTHS[Number(m) - 1] ?? m;
  // Yıllık seride kural olarak yıl yeter; ama asgari ücret gibi yıl içinde
  // değişen serilerde Ocak dışı dönemler ayla birlikte yazılır, yoksa iki
  // farklı karar aynı satırmış gibi görünür.
  if (freq === 'annual') return m === '01' ? y : `${month} ${y}`;
  if (freq === 'monthly' || freq === 'quarterly' || freq === 'semiannual') return `${month} ${y}`;
  return `${Number(d ?? 1)} ${month} ${y}`;
}

export function formatDateTime(iso: string | null): string {
  if (!iso) return 'hiç';
  const d = new Date(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(tr, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** "3 gün önce" gibi göreli süre. */
export function relativeTime(iso: string | null): string {
  if (!iso) return 'hiç';
  const then = Date.parse(iso.includes('T') ? iso : `${iso.replace(' ', 'T')}Z`);
  if (Number.isNaN(then)) return iso;
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return 'az önce';
  if (mins < 60) return `${mins} dk önce`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} sa önce`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} gün önce`;
  return `${Math.round(days / 30)} ay önce`;
}

export const SERIES_COLOR_VARS = [
  '--series-1', '--series-2', '--series-3', '--series-4',
  '--series-5', '--series-6', '--series-7', '--series-8',
] as const;

/**
 * Renk seriye göre sabitlenir, sıraya göre DEĞİL — bir seriyi listeden
 * çıkarmak kalanları yeniden boyamaz.
 */
export function colorForSeries(seriesId: string, selected: string[]): string {
  const idx = selected.indexOf(seriesId);
  const slot = SERIES_COLOR_VARS[(idx < 0 ? 0 : idx) % SERIES_COLOR_VARS.length]!;
  return `var(${slot})`;
}

export function cssVar(name: string, el: Element | null = document.documentElement): string {
  if (!el) return '#000';
  return getComputedStyle(el).getPropertyValue(name).trim() || '#000';
}

/**
 * Eksen çentiği. Çentik konumları veri dönemleri değil, ölçeğin seçtiği
 * rastgele zamanlardır; bu yüzden dönem biçimlendiricisinin ince ayrıntısı
 * (yıl içi asgari ücret değişikliği gibi) burada kullanılmaz.
 */
export function formatAxisTick(ms: number, freq?: string): string {
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getUTCFullYear();
  if (freq === 'annual') return String(y);
  return `${MONTHS[d.getUTCMonth()] ?? ''} ${y}`;
}

/**
 * Aynı önekle başlayan seri adlarını uç etiketlerinde kısaltır.
 * "Türkiye asgari ücret — brüt / — net / — işverene maliyet" üçlüsünde
 * grafiğin kenarında ayırt edici olan kısım yeterlidir; tam ad efsanede durur.
 */
export function stripSharedPrefix(labels: string[]): string[] {
  if (labels.length < 2) return labels;
  const first = labels[0] ?? '';
  let i = 0;
  while (i < first.length && labels.every((l) => l[i] === first[i])) i += 1;
  // Kelime/ayraç sınırına geri sar ki kelime ortasından kesilmesin.
  while (i > 0 && !/[\s—–\-·(]/.test(first[i - 1] ?? '')) i -= 1;
  if (i < 10) return labels;
  return labels.map((l) => l.slice(i).replace(/^[\s—–\-·]+/, '') || l);
}
