import { createApp } from './app.js';
import { config } from './config.js';
import { db } from './db/index.js';
import { bootstrapDatabase } from './db/bootstrap.js';

/**
 * İlk açılışta veritabanı şeması uygulanır, referans veriler ve yönetici
 * hesabı oluşturulur. Bu sayede dağıtım için elle komut çalıştırmak gerekmez —
 * uygulamayı başlatmak yeterlidir.
 */
bootstrapDatabase();

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`▸ Business Partner Portal  http://localhost:${config.port}  [${config.env}]`);
  console.log(`▸ Genel adres:  ${config.publicBaseUrl}`);
  if (config.demoMode) {
    console.log('▸ DEMO MODU AÇIK — örnek kayıtlar ve rol hesapları yüklü.');
    console.log('  Gerçek kullanımda SEED_DEMO=false yapın.');
  }
  if (!config.smtp.host) {
    console.log('▸ SMTP tanımlı değil — bildirimler e-posta kutusuna kaydedilecek.');
  }
});

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    console.log(`\n${signal} alındı, sunucu kapatılıyor...`);
    server.close(() => {
      db.close();
      process.exit(0);
    });
  });
}
