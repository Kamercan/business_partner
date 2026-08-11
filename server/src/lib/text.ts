/** Metin normalizasyonu — mükerrer başvuru tespiti ve arama için. */

/**
 * Ticaret unvanı ekleri — tek tek kelime olarak elenir, çünkü karşılaştırma
 * kelime bazlıdır. "A.Ş." slugify sonrası "a s" olarak iki kelimeye ayrılır.
 */
const LEGAL_SUFFIXES = new Set([
  'anonim', 'limited', 'sirketi', 'sirket', 'sanayi', 'sanayii', 'ticaret', 'ticari',
  'san', 'tic', 'ltd', 'sti', 'a', 's', 'as', 've',
  'inc', 'llc', 'llp', 'gmbh', 'ag', 'srl', 'spa', 'eood', 'ood', 'ad', 'doo', 'sa', 'sas',
  'bv', 'nv', 'co', 'company', 'corp', 'corporation', 'group', 'grup',
]);

const DIACRITICS = new RegExp("[\\u0300-\\u036f]", "g");
const UNSAFE_FILENAME = new RegExp("[\\u0000-\\u001f<>:\"|?*\\\\/]", "g");

/** Türkçe karakterleri sadeleştirir, noktalama ve boşlukları toparlar. */
export function slugify(input: string): string {
  return input
    .toLocaleLowerCase('tr-TR')
    .replaceAll('ı', 'i')
    .replaceAll('İ', 'i')
    .replaceAll('ş', 's')
    .replaceAll('ğ', 'g')
    .replaceAll('ü', 'u')
    .replaceAll('ö', 'o')
    .replaceAll('ç', 'c')
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Firma adını karşılaştırılabilir bir anahtara indirger.
 * "ABC Metal San. Tic. Ltd. Şti." ve "ABC METAL SANAYI TICARET LIMITED"
 * aynı anahtarı üretir.
 */
export function normalizeCompany(name: string): string {
  const words = slugify(name).split(' ').filter(Boolean);
  const kept = words.filter((w) => !LEGAL_SUFFIXES.has(w));
  return (kept.length ? kept : words).join(' ');
}

/** Vergi / DUNS numarasını sadece alfanumerik büyük harfe indirger. */
export function normalizeTaxId(taxId: string): string {
  return taxId.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Dosya adını güvenli hale getirir (dizin geçişi ve kontrol karakterleri). */
export function safeFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? 'dosya';
  return base.replace(UNSAFE_FILENAME, '_').slice(0, 180) || 'dosya';
}
