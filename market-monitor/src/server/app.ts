import express from 'express';
import compression from 'compression';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { api } from './routes/api.js';

const here = dirname(fileURLToPath(import.meta.url));

export function createApp() {
  const app = express();

  app.use(helmet({
    // Arayüz kendi paketlenmiş varlıklarını yükler; dış kaynak çağırmaz.
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(compression());
  app.use(express.json({ limit: '8mb' })); // CSV içe aktarım gövdesi

  app.use('/api', api);

  // Derlenmiş arayüz varsa aynı porttan servis edilir.
  const webDir = [join(here, '../web'), resolve(process.cwd(), 'dist/web')].find((p) => existsSync(p));
  if (webDir) {
    app.use(express.static(webDir, { maxAge: '1h', index: false }));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api')) return next();
      return res.sendFile(join(webDir, 'index.html'));
    });
  }

  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const message = err instanceof Error ? err.message : 'Beklenmeyen hata';
    console.error('[hata]', message);
    res.status(500).json({ error: message });
  });

  return app;
}
