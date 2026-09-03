import { getJson } from '../lib/http.js';
import { envKey } from '../config.js';

/**
 * EVDS seri kodu arama.
 *
 * TÜİK/TCMB seri kodları zaman içinde değişebildiği için katalogdaki kodları
 * körü körüne kullanmak yerine burada canlı arayıp teyit edersiniz.
 *
 * Kullanım: npm run evds:find -- "üfe"
 */
const term = process.argv.slice(2).join(' ').trim().toLocaleLowerCase('tr');
if (!term) {
  console.error('Kullanım: npm run evds:find -- "<anahtar kelime>"');
  process.exit(1);
}

const key = envKey('EVDS_API_KEY');
if (!key) {
  console.error(
    'EVDS_API_KEY tanımlı değil.\n' +
    'Ücretsiz anahtar: https://evds2.tcmb.gov.tr/index.php?/evds/login → giriş → Profil → API Anahtarı\n' +
    'Sonra: echo "EVDS_API_KEY=..." >> .env',
  );
  process.exit(1);
}

interface Group { DATAGROUP_CODE: string; DATAGROUP_NAME: string; CATEGORY_ID: number }
interface Serie { SERIE_CODE: string; SERIE_NAME: string; DATAGROUP_CODE: string; FREQUENCY_STR?: string; START_DATE?: string }

const groups = await getJson<Group[]>('https://evds2.tcmb.gov.tr/service/evds/datagroups/mode=0&type=json',
  { headers: { key } });

const matched = groups.filter((g) => g.DATAGROUP_NAME?.toLocaleLowerCase('tr').includes(term));
if (matched.length === 0) {
  console.log(`"${term}" için veri grubu bulunamadı. Daha genel bir kelime deneyin (ör. "fiyat", "ücret").`);
  process.exit(0);
}

console.log(`"${term}" için ${matched.length} veri grubu bulundu:\n`);
for (const g of matched.slice(0, 12)) {
  console.log(`▸ ${g.DATAGROUP_NAME}  [${g.DATAGROUP_CODE}]`);
  try {
    const series = await getJson<Serie[]>(
      `https://evds2.tcmb.gov.tr/service/evds/serieList/type=json&code=${encodeURIComponent(g.DATAGROUP_CODE)}`,
      { headers: { key } },
    );
    for (const s of series.slice(0, 15)) {
      console.log(`    ${s.SERIE_CODE.padEnd(24)} ${s.SERIE_NAME ?? ''}`);
    }
    if (series.length > 15) console.log(`    … ve ${series.length - 15} seri daha`);
  } catch (err) {
    console.log(`    (seri listesi alınamadı: ${err instanceof Error ? err.message : err})`);
  }
  console.log();
}
console.log('Bulduğunuz kodu src/server/catalog/series.ts içinde ilgili serinin params.code alanına yazın.');
