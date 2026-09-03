/** Ülke kodu → Türkçe ad. Katalogda seri adlarını üretmek için. */
export const COUNTRY_TR: Record<string, string> = {
  TUR: 'Türkiye', DEU: 'Almanya', ITA: 'İtalya', CHN: 'Çin',
  USA: 'ABD', POL: 'Polonya', IND: 'Hindistan', GBR: 'Birleşik Krallık',
  FRA: 'Fransa', ESP: 'İspanya', ROU: 'Romanya', RUS: 'Rusya',
};

export const COUNTRY_TR2: Record<string, string> = {
  TR: 'Türkiye', DE: 'Almanya', PL: 'Polonya', RO: 'Romanya',
  BG: 'Bulgaristan', ES: 'İspanya', FR: 'Fransa', HU: 'Macaristan',
  CZ: 'Çekya', PT: 'Portekiz', GR: 'Yunanistan', IT: 'İtalya',
  US: 'ABD', CN: 'Çin', EU: 'Avrupa Birliği', EA: 'Euro Bölgesi',
  EU27: 'AB-27', WORLD: 'Dünya',
};

/** Kategori kodu → Türkçe başlık ve kısa açıklama. */
export const CATEGORY_TR: Record<string, { title: string; blurb: string }> = {
  inflation:    { title: 'Enflasyon',      blurb: 'Türkiye TÜFE/Yİ-ÜFE ve ülkeler arası enflasyon' },
  minimum_wage: { title: 'Asgari ücret',   blurb: 'Türkiye ve dünya asgari ücretleri, işverene maliyet' },
  steel:        { title: 'Sac metal',      blurb: 'HRC, CRC, paslanmaz ve sürükleyici hammaddeler' },
  scrap:        { title: 'Hurda demir',    blurb: 'CFR Türkiye hurda ve resmî hurda endeksleri' },
  fuel:         { title: 'Akaryakıt',      blurb: 'Brent, pompa fiyatları, motorin' },
  freight:      { title: 'Navlun',         blurb: 'Konteyner spot navlunu ve karayolu taşımacılığı' },
  energy:       { title: 'Enerji',         blurb: 'Elektrik ve doğal gaz, sanayi fiyatları' },
  fx:           { title: 'Kur',            blurb: 'TCMB gösterge kurları' },
};
