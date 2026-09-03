import { config } from './config.js';
import { createApp } from './app.js';
import { syncCatalog } from './services/store.js';
import { refreshNow, startScheduler } from './services/scheduler.js';

async function main() {
  syncCatalog();
  console.log(`[açılış] katalog eşitlendi · veritabanı: ${config.dbPath}`);

  const app = createApp();
  app.listen(config.port, () => {
    console.log(`[açılış] API hazır → http://localhost:${config.port}/api/health`);
  });

  if (config.autoIngestOnBoot) {
    // Yalnızca verisi hiç olmayan seriler çekilir; açılış hızlı kalsın.
    console.log('[açılış] eksik seriler çekiliyor…');
    void refreshNow({ onlyMissing: true });
  }
  startScheduler();
}

main().catch((err) => {
  console.error('[ölümcül]', err);
  process.exit(1);
});
