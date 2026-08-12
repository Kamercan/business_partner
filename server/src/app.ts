import path from 'node:path';
import fs from 'node:fs';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { config, ROOT } from './config.js';
import { errorHandler } from './lib/http.js';
import { apiLimiter } from './middleware/rateLimit.js';
import { adminApplications, publicApplications } from './modules/applications.routes.js';
import { auditRoutes } from './modules/audits.routes.js';
import { authRoutes } from './modules/auth.routes.js';
import { contractRoutes } from './modules/contracts.routes.js';
import { documentRoutes } from './modules/documents.routes.js';
import { metaRoutes } from './modules/meta.routes.js';
import { ncrRoutes } from './modules/ncrs.routes.js';
import { portalRoutes } from './modules/portal.routes.js';
import { statsRoutes } from './modules/stats.routes.js';
import { supplierRoutes as supplierPortalRoutes } from './modules/supplier.routes.js';
import { supplierRoutes } from './modules/suppliers.routes.js';
import { taskRoutes } from './modules/tasks.routes.js';
import { userRoutes } from './modules/users.routes.js';

export function createApp(): express.Express {
  const app = express();

  // Ters proxy arkasında doğru istemci IP'si (rate limit ve KVKK kaydı için).
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: config.isProd
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", 'data:'],
              connectSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
            },
          }
        : false,
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use(compression());
  app.use(cors({ origin: config.corsOrigins, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, env: config.env, time: new Date().toISOString() });
  });

  app.use('/api', apiLimiter);

  // --- Kamuya açık uçlar ---
  app.use('/api/meta', metaRoutes);
  app.use('/api/applications', publicApplications);
  app.use('/api/portal', portalRoutes);
  app.use('/api/supplier', supplierPortalRoutes);
  app.use('/api/auth', authRoutes);

  // --- Yetkili uçlar ---
  app.use('/api/admin/applications', adminApplications);
  app.use('/api/admin/audits', auditRoutes);
  app.use('/api/admin/suppliers', supplierRoutes);
  app.use('/api/admin/contracts', contractRoutes);
  app.use('/api/admin/ncrs', ncrRoutes);
  app.use('/api/admin/documents', documentRoutes);
  app.use('/api/admin/tasks', taskRoutes);
  app.use('/api/admin/users', userRoutes);
  app.use('/api/admin/stats', statsRoutes);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Uç nokta bulunamadı.', code: 'NOT_FOUND' });
  });

  // --- Üretimde tek sunucudan SPA servisi ---
  const webDist = path.resolve(ROOT, '../web/dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use(errorHandler);
  return app;
}
