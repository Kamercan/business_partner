/**
 * Veritabanını ve yüklenen dosyaları sıfırlar. Yalnızca geliştirme içindir.
 *   npm run db:reset
 */
import fs from 'node:fs';
import { config } from '../config.js';

if (config.isProd && !process.argv.includes('--force')) {
  console.error('Üretim ortamında sıfırlama engellendi. Gerçekten istiyorsanız --force ekleyin.');
  process.exit(1);
}

for (const suffix of ['', '-wal', '-shm']) {
  const file = config.dbFile + suffix;
  if (fs.existsSync(file)) {
    fs.rmSync(file);
    console.log('· silindi:', file);
  }
}

if (fs.existsSync(config.storageDir)) {
  fs.rmSync(config.storageDir, { recursive: true, force: true });
  console.log('· silindi:', config.storageDir);
}
fs.mkdirSync(config.storageDir, { recursive: true });

console.log('✓ Sıfırlandı. `npm run db:seed` ile yeniden doldurabilirsiniz.');
