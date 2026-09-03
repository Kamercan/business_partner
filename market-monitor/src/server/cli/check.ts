import { SOURCE_BY_ID } from '../catalog/sources.js';
import { connectorFor } from '../connectors/index.js';
import { keyStatus } from '../services/ingest.js';
import { listSeries, setConfidence, syncCatalog } from '../services/store.js';

/**
 * Kaynak sağlık kontrolü.
 *
 * Her seriyi kendi kaynağına karşı GERÇEKTEN sorgular ve sonucu yazar. Amaç:
 * katalogdaki hiçbir seri kodunun körü körüne doğru varsayılmaması. Başarılı
 * olan seriler veritabanında "verified" olarak işaretlenir; başarısız olanlar
 * doğrulama linkiyle birlikte listelenir.
 *
 * Kullanım: npm run sources:check [-- --only fred,evds]
 */
const args = process.argv.slice(2);
const onlyIdx = args.indexOf('--only');
const onlyConnectors = onlyIdx >= 0 ? (args[onlyIdx + 1] ?? '').split(',') : null;

syncCatalog();

const series = listSeries().filter((s) => !onlyConnectors || onlyConnectors.includes(s.connector));
const width = Math.max(...series.map((s) => s.id.length)) + 1;

const rows: { id: string; state: string; detail: string; verifyUrl: string }[] = [];

for (const s of series) {
  const { key, envVar, usable } = keyStatus(s);

  if (s.connector === 'manual') {
    rows.push({ id: s.id, state: 'ELLE', detail: 'CSV/elle giriş — dış sorgu yok', verifyUrl: s.verifyUrl });
    continue;
  }
  if (!usable) {
    const src = SOURCE_BY_ID.get(s.sourceId);
    rows.push({
      id: s.id, state: 'ANAHTAR',
      detail: `${envVar} tanımlı değil${src?.signupUrl ? ` → ${src.signupUrl}` : ''}`,
      verifyUrl: s.verifyUrl,
    });
    continue;
  }

  // İlerleme yalnızca terminalde gösterilir; çıktı bir dosyaya ya da boruya
  // yönlendirildiğinde \r işe yaramaz ve satırları kirletir.
  if (process.stdout.isTTY) process.stdout.write(`\r${' '.repeat(76)}\r  … ${s.id}`);
  try {
    const obs = await connectorFor(s.connector).fetch(s, { apiKey: key, since: '2015-01-01' });
    if (obs.length === 0) {
      rows.push({ id: s.id, state: 'BOŞ', detail: 'kaynak yanıt verdi ama gözlem yok', verifyUrl: s.verifyUrl });
    } else {
      setConfidence(s.id, 'verified');
      const last = obs.at(-1)!;
      rows.push({
        id: s.id, state: 'TAMAM',
        detail: `${obs.length} gözlem · ${obs[0]!.period} → ${last.period} · son değer ${last.value}`,
        verifyUrl: s.verifyUrl,
      });
    }
  } catch (err) {
    rows.push({
      id: s.id, state: 'HATA',
      detail: (err instanceof Error ? err.message : String(err)).replace(/\s+/g, ' ').slice(0, 160),
      verifyUrl: s.verifyUrl,
    });
  }
}

const icon: Record<string, string> = { TAMAM: '✓', HATA: '✗', ANAHTAR: '🔑', ELLE: '✎', 'BOŞ': '∅' };
if (process.stdout.isTTY) process.stdout.write(`\r${' '.repeat(76)}\r`);
console.log('\nKAYNAK SAĞLIK KONTROLÜ\n' + '─'.repeat(78));
for (const r of rows) {
  console.log(`${icon[r.state] ?? '?'} ${r.id.padEnd(width)} ${r.detail}`);
}

const failed = rows.filter((r) => r.state === 'HATA' || r.state === 'BOŞ');
console.log('─'.repeat(78));
console.log(
  `${rows.filter((r) => r.state === 'TAMAM').length} doğrulandı · ` +
  `${rows.filter((r) => r.state === 'ANAHTAR').length} anahtar bekliyor · ` +
  `${rows.filter((r) => r.state === 'ELLE').length} elle · ${failed.length} sorunlu`,
);

if (failed.length) {
  console.log('\nSorunlu serilerin doğrulama sayfaları:');
  for (const f of failed) console.log(`  ${f.id}\n    ${f.verifyUrl}`);
  console.log(
    '\nSeri kodu değişmişse src/server/catalog/series.ts içindeki `params` alanını güncelleyin.\n' +
    'EVDS kodları için: npm run evds:find -- "<anahtar kelime>"',
  );
}
process.exit(failed.length > 0 ? 1 : 0);
