/**
 * Vergi / kimlik numarası doğrulaması.
 *
 * Türkiye'de tüzel kişilerin **VKN**'si 10, gerçek kişilerin **TCKN**'si 11
 * hanedir ve ikisinin de son hanesi sağlama (checksum) rakamıdır. Yalnızca
 * uzunluğa bakmak yanlış numaraların havuza girmesine yol açar; başvuru
 * sahibinin bir hane yanlış yazması aylar sonra sözleşme aşamasında ortaya
 * çıkar. Bu yüzden Türkiye seçiliyse sağlama rakamı hesaplanır.
 *
 * Yurt dışı başvurularında tek bir standart yoktur (DUNS, VAT, EORI...);
 * numaranın biçimi kabaca denetlenir, uydurma bir kural dayatılmaz.
 */

/** Sadece rakam ve harfleri bırakır, büyük harfe çevirir. */
export function normalizeTaxNumber(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Vergi Kimlik Numarası (10 hane) sağlaması.
 *
 * Maliye Bakanlığı algoritması: ilk 9 hanenin her biri için
 * `V = (hane + (10 - sıra)) mod 10` hesaplanır; V sıfırsa katkı sıfırdır,
 * değilse `(V * 2^(10 - sıra)) mod 9` alınır ve sonuç sıfır çıkarsa 9 kabul
 * edilir. Katkıların toplamının 10'a tümleyeni son haneyi verir.
 */
export function isValidVKN(value: string): boolean {
  if (!/^\d{10}$/.test(value)) return false;
  const d = [...value].map(Number);

  let sum = 0;
  for (let i = 0; i < 9; i += 1) {
    const v = (d[i] + (9 - i)) % 10;
    if (v === 0) continue;
    const p = (v * 2 ** (9 - i)) % 9;
    sum += p === 0 ? 9 : p;
  }

  return (10 - (sum % 10)) % 10 === d[9];
}

/**
 * T.C. Kimlik Numarası (11 hane) sağlaması.
 * 10. hane: (tek sıradakilerin toplamı × 7 − çift sıradakilerin toplamı) mod 10
 * 11. hane: ilk 10 hanenin toplamı mod 10
 */
export function isValidTCKN(value: string): boolean {
  if (!/^\d{11}$/.test(value)) return false;
  const d = [...value].map(Number);
  if (d[0] === 0) return false;

  const odd = d[0] + d[2] + d[4] + d[6] + d[8];
  const even = d[1] + d[3] + d[5] + d[7];
  if ((odd * 7 - even) % 10 !== d[9]) return false;

  const firstTen = d.slice(0, 10).reduce((a, b) => a + b, 0);
  return firstTen % 10 === d[10];
}

export type TaxCheck = { ok: true } | { ok: false; reason: 'format' | 'checksum' };

/**
 * Ülkeye göre vergi numarası kontrolü.
 * `country` ülke kodudur ('tr', 'de', 'other'...); Türkiye dışında biçim
 * kontrolüyle yetinilir.
 */
export function checkTaxNumber(raw: string, country: string): TaxCheck {
  const value = normalizeTaxNumber(raw);

  if (country.toLowerCase() === 'tr') {
    if (!/^\d{10}$|^\d{11}$/.test(value)) return { ok: false, reason: 'format' };
    const valid = value.length === 10 ? isValidVKN(value) : isValidTCKN(value);
    return valid ? { ok: true } : { ok: false, reason: 'checksum' };
  }

  // Yurt dışı: en az 4, en fazla 20 alfanümerik karakter.
  if (!/^[A-Z0-9]{4,20}$/.test(value)) return { ok: false, reason: 'format' };
  return { ok: true };
}
