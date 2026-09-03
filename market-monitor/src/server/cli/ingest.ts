import { syncCatalog } from '../services/store.js';
import { ingestAll } from '../services/ingest.js';

/**
 * Kullanım:
 *   npm run ingest                      → tüm seriler
 *   npm run ingest -- --only fx.usdtry  → tek seri
 *   npm run ingest -- --missing         → yalnızca verisi olmayanlar
 *   npm run ingest -- --since 2015-01-01
 */
const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};

syncCatalog();

const only = flag('only');
const results = await ingestAll({
  since: flag('since'),
  only: only ? only.split(',') : undefined,
  onlyMissing: args.includes('--missing'),
  onProgress: (r, done, total) => {
    const icon = r.status === 'ok' ? '✓' : r.status === 'skipped' ? '·' : '✗';
    const detail = r.status === 'ok' ? `${r.rows} gözlem` : (r.message ?? '');
    console.log(`[${String(done).padStart(2)}/${total}] ${icon} ${r.seriesId.padEnd(28)} ${detail}`);
  },
});

const ok = results.filter((r) => r.status === 'ok');
const skipped = results.filter((r) => r.status === 'skipped');
const failed = results.filter((r) => r.status === 'error');

console.log(`\nÖzet: ${ok.length} başarılı · ${skipped.length} atlandı · ${failed.length} hata`);
if (skipped.length) {
  console.log('\nAtlananlar (yapılandırma eksik — arıza değil):');
  for (const s of skipped) console.log(`  · ${s.seriesId}: ${s.message}`);
}
if (failed.length) {
  console.log('\nHatalar:');
  for (const f of failed) console.log(`  ✗ ${f.seriesId}: ${f.message}`);
}
process.exit(failed.length > 0 ? 1 : 0);
