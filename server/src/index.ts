import { createApp } from './app.js';
import { config } from './config.js';
import { db, migrate } from './db/index.js';

migrate();

const userCount = (db.prepare('SELECT COUNT(*) AS c FROM users').get() as { c: number }).c;
if (userCount === 0) {
  console.warn('⚠  Hiç kullanıcı yok. `npm run db:seed` çalıştırarak yönetici hesabı oluşturun.');
}

const app = createApp();
const server = app.listen(config.port, () => {
  console.log(`▸ Business Partner API  http://localhost:${config.port}  [${config.env}]`);
  console.log(`▸ İzin verilen origin:  ${config.corsOrigins.join(', ')}`);
  if (!config.smtp.host) {
    console.log('▸ SMTP tanımlı değil — bildirimler yalnızca e-posta kutusuna kaydedilecek.');
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
