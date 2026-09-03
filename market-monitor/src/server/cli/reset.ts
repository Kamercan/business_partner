import { rmSync } from 'node:fs';
import { config } from '../config.js';
import { syncCatalog } from '../services/store.js';

for (const suffix of ['', '-wal', '-shm']) {
  rmSync(`${config.dbPath}${suffix}`, { force: true });
}
console.log(`Veritabanı silindi: ${config.dbPath}`);
syncCatalog();
console.log('Katalog yeniden oluşturuldu. Veri çekmek için: npm run ingest');
